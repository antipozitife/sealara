const { XMLParser } = require("fast-xml-parser");

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstByKeyPath(root, path) {
  let current = root;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = current[segment];
  }
  return current ?? null;
}

function deepSearchObjectBySuffix(node, suffix) {
  if (!node || typeof node !== "object") return null;
  for (const [key, value] of Object.entries(node)) {
    if (String(key).endsWith(suffix)) return value;
    const nested = deepSearchObjectBySuffix(value, suffix);
    if (nested !== null) return nested;
  }
  return null;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const MOCK_DOCTOR_META = {
  "doc-1": { doctorName: "Петрова Анна Сергеевна", specialization: "Терапевт" },
  "doc-2": { doctorName: "Смирнов Илья Андреевич", specialization: "Невролог" },
};

function mockDoctorDisplay(doctorId) {
  const id = String(doctorId || "");
  return MOCK_DOCTOR_META[id] || { doctorName: "Врач", specialization: "Специалист" };
}

function createGosuslugiClient({
  logger,
  sqlPool,
  baseUrl,
  apiKey,
  timeoutMs,
  mode = "mock",
  guid = "",
}) {
  const normalizedMode = String(mode || "mock").toLowerCase();
  const integrationGuid = String(guid || "").trim() || "SealaraGUID";
  const soapUrl = String(baseUrl || "").replace(/\/+$/, "");

  async function call(path, { method = "GET", body } = {}) {
    const urlBase = String(baseUrl || "").replace(/\/+$/, "");
    if (!urlBase) {
      return { _error: true, status: 503, detail: "Gosuslugi integration is not configured" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 7000));
    try {
      const response = await fetch(`${urlBase}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = "";
        try {
          const payload = await response.json();
          detail = String(payload?.detail || payload?.error || "");
        } catch {
          detail = "";
        }
        return { _error: true, status: response.status, detail: detail || "Gosuslugi integration error" };
      }
      return await response.json();
    } catch (error) {
      logger.warn({ error: String(error?.message || error), path }, "Gosuslugi call failed");
      return { _error: true, status: 503, detail: "Gosuslugi integration unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }

  async function soapCall(action, innerXml) {
    if (!soapUrl) {
      return { _error: true, status: 503, detail: "Gosuslugi SOAP endpoint is not configured" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 7000));
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/" xmlns:hub="http://schemas.datacontract.org/2004/07/HubService2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Header>
    <Authorization>${xmlEscape(apiKey)}</Authorization>
  </soapenv:Header>
  <soapenv:Body>
    ${innerXml}
  </soapenv:Body>
</soapenv:Envelope>`;
    try {
      const response = await fetch(soapUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"http://tempuri.org/${action}"`,
        },
        body: envelope,
        signal: controller.signal,
      });
      const xmlText = await response.text();
      if (!response.ok) {
        return {
          _error: true,
          status: response.status,
          detail: `SOAP ${action} failed with status ${response.status}`,
          raw: xmlText.slice(0, 1000),
        };
      }
      const parsed = xmlParser.parse(xmlText);
      const envelopeObj = firstByKeyPath(parsed, ["Envelope"]) || deepSearchObjectBySuffix(parsed, "Envelope");
      const bodyObj = firstByKeyPath(envelopeObj, ["Body"]) || deepSearchObjectBySuffix(envelopeObj, "Body");
      const actionResponse = firstByKeyPath(bodyObj, [`${action}Response`]) || deepSearchObjectBySuffix(bodyObj, `${action}Response`);
      const actionResult = firstByKeyPath(actionResponse, [`${action}Result`]) || deepSearchObjectBySuffix(actionResponse, `${action}Result`);
      if (!actionResult) {
        return { _error: true, status: 502, detail: `SOAP ${action} returned empty payload` };
      }
      const successRaw = firstByKeyPath(actionResult, ["Success"]);
      const success = String(successRaw ?? "").toLowerCase() === "true";
      if (!success) {
        return {
          _error: true,
          status: 502,
          detail: `SOAP ${action} returned Success=false`,
          payload: actionResult,
        };
      }
      return actionResult;
    } catch (error) {
      logger.warn({ action, error: String(error?.message || error) }, "SOAP call failed");
      return { _error: true, status: 503, detail: `SOAP ${action} unavailable` };
    } finally {
      clearTimeout(timer);
    }
  }

  async function soapGetDistrictList() {
    const result = await soapCall(
      "GetDistrictList",
      `<tem:GetDistrictList><tem:guid>${xmlEscape(integrationGuid)}</tem:guid></tem:GetDistrictList>`
    );
    if (result?._error) return result;
    const districtsRoot = firstByKeyPath(result, ["Districts"]);
    const items = toArray(districtsRoot?.District).map((item) => ({
      idDistrict: String(item?.IdDistrict ?? ""),
      districtName: String(item?.DistrictName ?? ""),
      okato: String(item?.Okato ?? ""),
    }));
    return { items };
  }

  async function soapGetLpuList(idDistrict) {
    const result = await soapCall(
      "GetLPUList",
      `<tem:GetLPUList>
        <tem:idDistrict>${xmlEscape(idDistrict)}</tem:idDistrict>
        <tem:guid>${xmlEscape(integrationGuid)}</tem:guid>
      </tem:GetLPUList>`
    );
    if (result?._error) return result;
    const root = firstByKeyPath(result, ["ListLPU"]);
    const clinics = toArray(root?.Clinic).map((clinic) => ({
      idLpu: String(clinic?.IdLPU ?? ""),
      shortName: String(clinic?.LPUShortName ?? ""),
      fullName: String(clinic?.LPUFullName ?? ""),
      isActive: String(clinic?.IsActive ?? "").toLowerCase() !== "false",
      district: String(clinic?.District ?? ""),
    }));
    return { items: clinics };
  }

  function buildSoapPatientFromProfile(patient = {}) {
    const surname = String(patient.surname || patient.lastName || "").trim();
    const name = String(patient.firstName || patient.name || "").trim();
    const secondName = String(patient.middleName || patient.patronymic || "").trim();
    const birthday = String(patient.birthDate || "").trim();
    const cellPhone = String(patient.phone || "").replace(/\D+/g, "");
    const snils = String(patient.snils || "").trim();
    const polisN = String(patient.polisNumber || "").trim();
    return `
      <pat xmlns:a="http://schemas.datacontract.org/2004/07/HubService2" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
        <a:AriaNumber i:nil="true" />
        <a:Birthday>${xmlEscape(birthday ? `${birthday}T00:00:00` : "")}</a:Birthday>
        <a:CellPhone>${xmlEscape(cellPhone)}</a:CellPhone>
        <a:Document_N i:nil="true" />
        <a:Document_S i:nil="true" />
        <a:HomePhone i:nil="true" />
        <a:IdPat i:nil="true" />
        <a:Name>${xmlEscape(name)}</a:Name>
        <a:Polis_N>${xmlEscape(polisN)}</a:Polis_N>
        <a:Polis_S i:nil="true" />
        <a:SecondName>${xmlEscape(secondName)}</a:SecondName>
        <a:Snils>${xmlEscape(snils)}</a:Snils>
        <a:Surname>${xmlEscape(surname)}</a:Surname>
      </pat>`;
  }

  async function soapCheckPatient(idLpu, patient) {
    const result = await soapCall(
      "CheckPatient",
      `<tem:CheckPatient>
        ${buildSoapPatientFromProfile(patient)}
        <idLpu>${xmlEscape(idLpu)}</idLpu>
        <guid>${xmlEscape(integrationGuid)}</guid>
        <idHistory xsi:nil="true" />
      </tem:CheckPatient>`
    );
    if (result?._error) return result;
    return { idPat: String(result?.IdPat ?? "") };
  }

  async function soapGetSpesialityList(idLpu, idPat) {
    const result = await soapCall(
      "GetSpesialityList",
      `<tem:GetSpesialityList>
        <idLpu>${xmlEscape(idLpu)}</idLpu>
        <idPat>${xmlEscape(idPat)}</idPat>
        <guid>${xmlEscape(integrationGuid)}</guid>
        <idHistory xsi:nil="true" />
      </tem:GetSpesialityList>`
    );
    if (result?._error) return result;
    const root = firstByKeyPath(result, ["ListSpesiality"]);
    const items = toArray(root?.Spesiality).map((item) => ({
      idSpesiality: String(item?.IdSpesiality ?? ""),
      nameSpesiality: String(item?.NameSpesiality ?? ""),
      nearestDate: String(item?.NearestDate ?? ""),
    }));
    return { items };
  }

  async function soapGetDoctorList(idLpu, idPat, idSpesiality) {
    const result = await soapCall(
      "GetDoctorList",
      `<tem:GetDoctorList>
        <idLpu>${xmlEscape(idLpu)}</idLpu>
        <idPat>${xmlEscape(idPat)}</idPat>
        <idSpesiality>${xmlEscape(idSpesiality)}</idSpesiality>
        <guid>${xmlEscape(integrationGuid)}</guid>
        <idHistory xsi:nil="true" />
      </tem:GetDoctorList>`
    );
    if (result?._error) return result;
    const root = firstByKeyPath(result, ["Docs"]);
    const items = toArray(root?.Doctor).map((item) => ({
      idDoc: String(item?.IdDoc ?? ""),
      name: String(item?.Name ?? ""),
      nearestDate: String(item?.NearestDate ?? ""),
      lastDate: String(item?.LastDate ?? ""),
      comment: String(item?.Comment ?? ""),
    }));
    return { items };
  }

  async function soapGetAvailableAppointments(idLpu, idDoc, idPat) {
    const now = new Date();
    const end = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
    const result = await soapCall(
      "GetAvaibleAppointments",
      `<tem:GetAvaibleAppointments>
        <idDoc>${xmlEscape(idDoc)}</idDoc>
        <idLpu>${xmlEscape(idLpu)}</idLpu>
        <idPat>${xmlEscape(idPat)}</idPat>
        <visitStart>${xmlEscape(now.toISOString())}</visitStart>
        <visitEnd>${xmlEscape(end.toISOString())}</visitEnd>
        <guid>${xmlEscape(integrationGuid)}</guid>
      </tem:GetAvaibleAppointments>`
    );
    if (result?._error) return result;
    const root = firstByKeyPath(result, ["ListAppointments"]);
    const slots = toArray(root?.Appointment).map((slot) => ({
      idAppointment: String(slot?.IdAppointment ?? ""),
      visitStart: String(slot?.VisitStart ?? ""),
      visitEnd: String(slot?.VisitEnd ?? ""),
      room: String(slot?.Room ?? ""),
      address: String(slot?.Address ?? ""),
    }));
    return { slots };
  }

  async function listDoctors({ region, specialization, patient }) {
    if (normalizedMode === "mock") {
      return {
        items: [
          {
            id: "doc-1",
            fullName: "Петрова Анна Сергеевна",
            specialization: "Терапевт",
            clinic: "ГКБ №1",
            region: region || "Москва",
            nextAvailableAt: "2026-04-30T09:30:00.000Z",
          },
          {
            id: "doc-2",
            fullName: "Смирнов Илья Андреевич",
            specialization: "Невролог",
            clinic: "ГКБ №4",
            region: region || "Москва",
            nextAvailableAt: "2026-04-30T12:00:00.000Z",
          },
        ],
      };
    }
    if (normalizedMode === "live") {
      const districtsResult = await soapGetDistrictList();
      if (districtsResult?._error) return districtsResult;
      const regionNorm = String(region || "").trim().toLowerCase();
      const allDistricts = toArray(districtsResult.items);
      const districtCandidates = (regionNorm
        ? allDistricts.filter((d) => String(d.districtName || "").toLowerCase().includes(regionNorm))
        : allDistricts
      ).slice(0, 3);
      if (districtCandidates.length === 0) {
        return { _error: true, status: 404, detail: "Район по региону не найден в SOAP каталоге" };
      }
      const doctors = [];
      for (const district of districtCandidates) {
        const lpuResult = await soapGetLpuList(district.idDistrict);
        if (lpuResult?._error) continue;
        const activeLpus = toArray(lpuResult.items).filter((lpu) => lpu.isActive).slice(0, 3);
        for (const lpu of activeLpus) {
          const patientResult = await soapCheckPatient(lpu.idLpu, patient || {});
          if (patientResult?._error || !patientResult.idPat) continue;
          const specialitiesResult = await soapGetSpesialityList(lpu.idLpu, patientResult.idPat);
          if (specialitiesResult?._error) continue;
          const specialties = toArray(specialitiesResult.items)
            .filter((spec) => {
              if (!specialization) return true;
              return String(spec.nameSpesiality || "").toLowerCase().includes(String(specialization).toLowerCase());
            })
            .slice(0, 4);
          for (const spec of specialties) {
            const doctorResult = await soapGetDoctorList(lpu.idLpu, patientResult.idPat, spec.idSpesiality);
            if (doctorResult?._error) continue;
            for (const doctor of toArray(doctorResult.items).slice(0, 5)) {
              const slotsResult = await soapGetAvailableAppointments(lpu.idLpu, doctor.idDoc, patientResult.idPat);
              const slots = slotsResult?._error ? [] : toArray(slotsResult.slots);
              doctors.push({
                id: `${lpu.idLpu}:${doctor.idDoc}`,
                fullName: doctor.name || "Неизвестный врач",
                specialization: spec.nameSpesiality || "Специалист",
                clinic: lpu.shortName || lpu.fullName || `ЛПУ ${lpu.idLpu}`,
                region: district.districtName || region || "",
                districtId: district.idDistrict,
                lpuId: lpu.idLpu,
                doctorId: doctor.idDoc,
                idPat: patientResult.idPat,
                nextAvailableAt: slots[0]?.visitStart || doctor.nearestDate || spec.nearestDate || "",
                slots,
              });
            }
          }
        }
      }
      return { items: doctors.slice(0, 40) };
    }
    const query = new URLSearchParams();
    if (region) query.set("region", String(region));
    if (specialization) query.set("specialization", String(specialization));
    return call(`/appointments/doctors?${query.toString()}`);
  }

  async function createAppointment(payload) {
    if (normalizedMode === "mock") {
      const patientUserId = Number(payload?.patientUserId);
      const doctorId = String(payload?.doctorId || "");
      const { doctorName, specialization } = mockDoctorDisplay(doctorId);
      const appointment = {
        id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        patientUserId: Number.isFinite(patientUserId) ? patientUserId : 0,
        doctorId,
        doctorName,
        specialization,
        startsAt: String(payload?.startsAt || ""),
        reason: String(payload?.reason || ""),
        status: "booked",
        source: "gosuslugi-mock",
      };
      if (!sqlPool) {
        return { _error: true, status: 503, detail: "База данных недоступна" };
      }
      if (Number.isFinite(patientUserId) && patientUserId > 0) {
        try {
          await sqlPool.query(
            `
            INSERT INTO patient_appointments (
              id, patient_user_id, doctor_external_id, doctor_name, specialization, starts_at, reason, status, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              appointment.id,
              patientUserId,
              doctorId,
              doctorName,
              specialization,
              appointment.startsAt,
              appointment.reason,
              appointment.status,
              appointment.source,
            ]
          );
        } catch (error) {
          logger.warn({ error: String(error?.message || error) }, "patient_appointments insert failed");
          return { _error: true, status: 503, detail: "Не удалось сохранить запись" };
        }
      }
      return { ok: true, appointment };
    }
    if (normalizedMode === "live") {
      const idAppointment = String(payload?.idAppointment || "").trim();
      const idLpu = String(payload?.idLpu || "").trim();
      const idPat = String(payload?.idPat || "").trim();
      if (!idAppointment || !idLpu || !idPat) {
        return {
          _error: true,
          status: 400,
          detail: "Для живой SOAP-записи нужны idAppointment, idLpu и idPat",
        };
      }
      const result = await soapCall(
        "SetAppointment",
        `<tem:SetAppointment>
          <idAppointment>${xmlEscape(idAppointment)}</idAppointment>
          <idLpu>${xmlEscape(idLpu)}</idLpu>
          <idPat>${xmlEscape(idPat)}</idPat>
          <doctorsReferral xsi:nil="true" />
          <attachedReferral xsi:nil="true" />
          <idAppointmentPrev xsi:nil="true" />
          <guid>${xmlEscape(integrationGuid)}</guid>
          <idHistory xsi:nil="true" />
        </tem:SetAppointment>`
      );
      if (result?._error) return result;
      return {
        ok: true,
        appointment: {
          id: idAppointment,
          idLpu,
          idPat,
          startsAt: String(payload?.startsAt || ""),
          reason: String(payload?.reason || ""),
          status: "booked",
          source: "gosuslugi-soap",
        },
      };
    }
    return call("/appointments/book", { method: "POST", body: payload });
  }

  async function listMyAppointments({ userId }) {
    if (normalizedMode === "mock") {
      if (!sqlPool) {
        return { _error: true, status: 503, detail: "База данных недоступна" };
      }
      try {
        const [rows] = await sqlPool.query(
          `
          SELECT id, patient_user_id, doctor_external_id, doctor_name, specialization, starts_at, reason, status, source
          FROM patient_appointments
          WHERE patient_user_id = ?
          ORDER BY created_at DESC
          `,
          [userId]
        );
        const items = (Array.isArray(rows) ? rows : []).map((row) => ({
          id: String(row.id),
          patientUserId: Number(row.patient_user_id),
          doctorId: String(row.doctor_external_id),
          doctorName: String(row.doctor_name),
          specialization: String(row.specialization),
          startsAt: String(row.starts_at),
          reason: String(row.reason || ""),
          status: String(row.status),
          source: String(row.source || "gosuslugi-mock"),
        }));
        return { items };
      } catch (error) {
        logger.warn({ error: String(error?.message || error) }, "patient_appointments list failed");
        return { _error: true, status: 503, detail: "Не удалось загрузить записи" };
      }
    }
    return call(`/appointments/my?user_id=${encodeURIComponent(String(userId))}`);
  }

  async function listDoctorAppointments({ doctorUserId }) {
    if (normalizedMode === "mock") {
      if (!sqlPool) {
        return { _error: true, status: 503, detail: "База данных недоступна" };
      }
      try {
        const [rows] = await sqlPool.query(
          `
          SELECT pa.id, pa.starts_at, pa.reason, pa.status, pa.source,
                 u.surname, u.name, u.patronymic
          FROM patient_appointments pa
          INNER JOIN users u ON u.id = pa.patient_user_id
          ORDER BY pa.created_at DESC
          LIMIT 200
          `
        );
        const items = (Array.isArray(rows) ? rows : []).map((row) => ({
          id: String(row.id),
          doctorUserId: Number(doctorUserId),
          patientName: [row.surname, row.name, row.patronymic].filter(Boolean).join(" ").trim() || "Пациент",
          startsAt: String(row.starts_at),
          reason: String(row.reason || ""),
          status: String(row.status),
          source: String(row.source || "gosuslugi-mock"),
        }));
        return { items };
      } catch (error) {
        logger.warn({ error: String(error?.message || error) }, "patient_appointments doctor list failed");
        return { _error: true, status: 503, detail: "Не удалось загрузить записи врача" };
      }
    }
    return call(`/appointments/doctor?doctor_user_id=${encodeURIComponent(String(doctorUserId))}`);
  }

  async function updateAppointmentStatus({ appointmentId, status, doctorUserId }) {
    if (normalizedMode === "mock") {
      if (!sqlPool) {
        return { _error: true, status: 503, detail: "База данных недоступна" };
      }
      try {
        const [result] = await sqlPool.query(`UPDATE patient_appointments SET status = ? WHERE id = ?`, [
          status,
          appointmentId,
        ]);
        if (!result.affectedRows) {
          return { _error: true, status: 404, detail: "Запись не найдена" };
        }
        return {
          ok: true,
          appointment: {
            id: String(appointmentId),
            status: String(status),
            doctorUserId: Number(doctorUserId),
            source: "gosuslugi-mock",
          },
        };
      } catch (error) {
        logger.warn({ error: String(error?.message || error) }, "patient_appointments status update failed");
        return { _error: true, status: 503, detail: "Не удалось обновить запись" };
      }
    }
    return call("/appointments/status", {
      method: "PATCH",
      body: {
        appointment_id: appointmentId,
        status,
        doctor_user_id: doctorUserId,
      },
    });
  }

  return {
    listDoctors,
    createAppointment,
    listMyAppointments,
    listDoctorAppointments,
    updateAppointmentStatus,
    mode: normalizedMode,
  };
}

module.exports = {
  createGosuslugiClient,
};
