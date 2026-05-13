function registerDoctorRoutes(app, deps) {
  const {
    authMiddleware,
    doctorOnly,
    doctorConfirmLimiter,
    validateBody,
    doctorConfirmSchema,
    appointmentCreateSchema,
    appointmentStatusUpdateSchema,
    parsePaginationQuery,
    sqlPool,
    learnFromDoctorFeedback,
    gosuslugiClient,
    logger,
  } = deps;

  app.get("/api/doctors", authMiddleware, async (req, res) => {
    const region = String(req.query?.region || req.user?.profile?.region || "").trim();
    const specialization = String(req.query?.specialization || "").trim();
    const patientProfile = {
      ...(req.user?.profile || {}),
      fullName: String(req.user?.name || ""),
      surname: String(req.user?.profile?.surname || ""),
      firstName: String(req.user?.profile?.firstName || ""),
      middleName: String(req.user?.profile?.middleName || ""),
    };
    const result = await gosuslugiClient.listDoctors({ region, specialization, patient: patientProfile });
    if (!result || result._error) {
      return res.status(Number(result?.status || 503)).json({
        error: result?.detail || "Не удалось получить список врачей через Госуслуги",
      });
    }
    return res.json({
      source: "gosuslugi",
      mode: gosuslugiClient.mode,
      items: Array.isArray(result.items) ? result.items : [],
    });
  });

  app.post("/api/appointments", authMiddleware, validateBody(appointmentCreateSchema), async (req, res) => {
    const payload = {
      patientUserId: Number(req.user.id),
      doctorId: String(req.body.doctorId),
      startsAt: String(req.body.startsAt),
      reason: String(req.body.reason),
      idAppointment: req.body.idAppointment ? String(req.body.idAppointment) : "",
      idLpu: req.body.idLpu ? String(req.body.idLpu) : "",
      idPat: req.body.idPat ? String(req.body.idPat) : "",
    };
    const result = await gosuslugiClient.createAppointment(payload);
    if (!result || result._error) {
      return res.status(Number(result?.status || 503)).json({
        error: result?.detail || "Не удалось создать запись через Госуслуги",
      });
    }
    return res.status(201).json({
      ok: true,
      source: "gosuslugi",
      mode: gosuslugiClient.mode,
      appointment: result.appointment || null,
    });
  });

  app.get("/api/appointments/my", authMiddleware, async (req, res) => {
    const result = await gosuslugiClient.listMyAppointments({ userId: req.user.id });
    if (!result || result._error) {
      return res.status(Number(result?.status || 503)).json({
        error: result?.detail || "Не удалось получить записи из Госуслуг",
      });
    }
    return res.json({
      source: "gosuslugi",
      mode: gosuslugiClient.mode,
      items: Array.isArray(result.items) ? result.items : [],
    });
  });

  app.get("/api/doctor/appointments", authMiddleware, doctorOnly, async (req, res) => {
    const result = await gosuslugiClient.listDoctorAppointments({ doctorUserId: req.user.id });
    if (!result || result._error) {
      return res.status(Number(result?.status || 503)).json({
        error: result?.detail || "Не удалось получить записи врача из Госуслуг",
      });
    }
    return res.json({
      source: "gosuslugi",
      mode: gosuslugiClient.mode,
      items: Array.isArray(result.items) ? result.items : [],
    });
  });

  app.patch(
    "/api/doctor/appointments/status",
    authMiddleware,
    doctorOnly,
    validateBody(appointmentStatusUpdateSchema),
    async (req, res) => {
      const result = await gosuslugiClient.updateAppointmentStatus({
        appointmentId: String(req.body.appointmentId),
        status: String(req.body.status),
        doctorUserId: req.user.id,
      });
      if (!result || result._error) {
        return res.status(Number(result?.status || 503)).json({
          error: result?.detail || "Не удалось обновить статус записи в Госуслугах",
        });
      }
      return res.json({
        ok: true,
        source: "gosuslugi",
        mode: gosuslugiClient.mode,
        appointment: result.appointment || null,
      });
    }
  );

  app.get("/api/doctor/feedback", authMiddleware, doctorOnly, async (req, res) => {
    const { page, limit, offset } = parsePaginationQuery(req.query || {});
    const [countRows] = await sqlPool.query(`SELECT COUNT(*) AS total FROM doctor_feedback`);
    const total = Number(countRows?.[0]?.total ?? 0);
    const [rows] = await sqlPool.query(
      `
      SELECT id, user_id, predicted_disease_id, confirmed_disease_id, confidence, confirmed_by_doctor, created_at
      FROM doctor_feedback
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
      `,
      [limit, offset]
    );
    const totalPages = Math.ceil(total / limit);
    return res.json({
      items: Array.isArray(rows) ? rows : [],
      pagination: { total, page, limit, totalPages },
    });
  });

  app.get("/api/doctor/auth-events", authMiddleware, doctorOnly, async (req, res) => {
    const { page, limit, offset } = parsePaginationQuery(req.query || {});
    const eventTypeRaw = String(req.query?.event_type ?? "").trim();
    const eventType = eventTypeRaw.slice(0, 64);
    const hasTypeFilter = Boolean(eventType);

    let countSql = `SELECT COUNT(*) AS total FROM auth_events`;
    let listSql = `
      SELECT id, event_type, user_id, ip_address, user_agent, details_json, created_at
      FROM auth_events
    `;
    const countParams = [];
    const listParams = [];
    if (hasTypeFilter) {
      countSql += ` WHERE event_type = ?`;
      listSql += ` WHERE event_type = ?`;
      countParams.push(eventType);
      listParams.push(eventType);
    }
    listSql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    listParams.push(limit, offset);

    const [countRows] = await sqlPool.query(countSql, countParams);
    const total = Number(countRows?.[0]?.total ?? 0);
    const [rows] = await sqlPool.query(listSql, listParams);
    const totalPages = Math.ceil(total / limit);
    return res.json({
      items: Array.isArray(rows) ? rows : [],
      pagination: { total, page, limit, totalPages },
    });
  });

  app.post(
    "/api/doctor/confirm",
    authMiddleware,
    doctorOnly,
    doctorConfirmLimiter,
    validateBody(doctorConfirmSchema),
    async (req, res) => {
      const feedbackId = Number(req.body.feedbackId);
      const confirmedDiseaseId = Number(req.body.confirmedDiseaseId);
      const [diseaseRows] = await sqlPool.query("SELECT id FROM diseases WHERE id = ? LIMIT 1", [confirmedDiseaseId]);
      if (!Array.isArray(diseaseRows) || diseaseRows.length === 0) {
        return res.status(400).json({ error: "confirmedDiseaseId не найден в diseases" });
      }
      const [rows] = await sqlPool.query(
        `
        SELECT f.*, u.email AS patient_email
        FROM doctor_feedback f
        JOIN users u ON u.id = f.user_id
        WHERE f.id = ?
        LIMIT 1
        `,
        [feedbackId]
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Feedback not found" });
      }
      const feedback = rows[0];
      const feedbackDoctorId = feedback.doctor_id === null || feedback.doctor_id === undefined ? null : Number(feedback.doctor_id);
      if (feedbackDoctorId !== null && feedbackDoctorId !== Number(req.user.id)) {
        return res.status(403).json({ error: "Этот фидбек уже подтверждён другим врачом" });
      }
      if (feedback.confirmed_by_doctor && Number(feedback.confirmed_disease_id) === confirmedDiseaseId) {
        return res.json({ ok: true, idempotent: true });
      }
      const predictedId = Number(feedback.predicted_disease_id);
      if (Number.isFinite(predictedId) && predictedId !== confirmedDiseaseId) {
        logger.warn(
          { feedbackId, predictedId, confirmedDiseaseId, patientUserId: feedback.user_id, doctorId: req.user.id },
          "Doctor confirmed a disease different from predicted"
        );
      }
      await sqlPool.query(
        "UPDATE doctor_feedback SET confirmed_disease_id=?, confirmed_by_doctor=TRUE, doctor_id=? WHERE id=?",
        [confirmedDiseaseId, Number(req.user.id), feedbackId]
      );
      await learnFromDoctorFeedback(feedback.user_id, confirmedDiseaseId, feedback.query_id);
      return res.json({ ok: true });
    }
  );
}

module.exports = {
  registerDoctorRoutes,
};
