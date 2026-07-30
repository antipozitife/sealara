import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import type { Appointment, AuthUser, DoctorCard } from "../../lib/auth-api";
import { createAppointmentViaSlot, listDoctors, listMyAppointments, meOptional } from "../../lib/auth-api";
import "../../styles/layout-shell.css";
import "./doctors.css";

function formatDate(value: string) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return value || "—";
  return new Date(ts).toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const DoctorsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [doctors, setDoctors] = useState<DoctorCard[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [reason, setReason] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [integrationMode, setIntegrationMode] = useState("unknown");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const session = await meOptional();
      if (!session) {
        if (alive) setLoading(false);
        navigate("/auth");
        return;
      }
      if (alive) setCurrentUser(session.user);
      try {
        const [doctorsResp, appointmentsResp] = await Promise.all([listDoctors(), listMyAppointments()]);
        if (!alive) return;
        setDoctors(Array.isArray(doctorsResp.items) ? doctorsResp.items : []);
        setAppointments(Array.isArray(appointmentsResp.items) ? appointmentsResp.items : []);
        setIntegrationMode(String(doctorsResp.mode || appointmentsResp.mode || "unknown"));
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Не удалось загрузить данные по врачам");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === selectedDoctorId) || null,
    [doctors, selectedDoctorId],
  );
  const selectedSlot = useMemo(
    () => (selectedDoctor?.slots || []).find((slot) => slot.idAppointment === selectedSlotId) || null,
    [selectedDoctor, selectedSlotId],
  );

  useEffect(() => {
    setSelectedSlotId("");
    setStartsAt("");
  }, [selectedDoctorId]);

  const onBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const effectiveStartsAt = selectedSlot?.visitStart || startsAt;
      const result = await createAppointmentViaSlot({
        doctorId: selectedDoctorId,
        startsAt: effectiveStartsAt,
        reason,
        idAppointment: selectedSlot?.idAppointment,
        idLpu: selectedDoctor?.lpuId,
        idPat: selectedDoctor?.idPat,
      });
      if (result.appointment) {
        setAppointments((prev) => [result.appointment as Appointment, ...prev]);
      }
      setReason("");
      setStartsAt("");
      setSelectedSlotId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось записаться к врачу");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="shell doctors-page">
        <Header />
        <main id="main-content" className="doctors-main">
          Загрузка врачей...
        </main>
        <Footer />
      </div>
    );
  }

  if (currentUser?.role === "doctor") {
    return (
      <div className="shell doctors-page">
        <Header />
        <main id="main-content" className="doctors-main">
          <section className="doctors-hero">
            <h1>Кабинет врача</h1>
            <p>Инна Смирнова · терапевт. Здесь показаны демонстрационные записи пациентов на приём.</p>
          </section>

          <section className="doctors-panel doctors-panel--wide">
            <h2>Записанные пациенты</h2>
            {appointments.length === 0 ? (
              <p className="doctors-empty">На ближайшее время записей нет.</p>
            ) : (
              <ul className="appointments-list">
                {appointments.map((appointment) => (
                  <li key={appointment.id}>
                    <strong>{appointment.patientName || "Пациент"}</strong>
                    <span>{formatDate(appointment.startsAt)}</span>
                    <span>Статус: {appointment.status}</span>
                    <small>Причина обращения: {appointment.reason}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="shell doctors-page">
      <Header />
      <main id="main-content" className="doctors-main">
        <section className="doctors-hero">
          <h1>Запись к врачу через Госуслуги</h1>
          <p>
            Вкладка работает через интеграционный API Госуслуг. Текущий режим интеграции:{" "}
            <strong>{integrationMode}</strong>.
          </p>
        </section>

        <section className="doctors-grid">
          <article className="doctors-panel">
            <h2>Доступные врачи</h2>
            {doctors.length === 0 ? (
              <p className="doctors-empty">Нет доступных врачей по вашему региону.</p>
            ) : (
              <ul className="doctors-list">
                {doctors.map((doctor) => (
                  <li
                    key={doctor.id}
                    className={`doctor-card${selectedDoctorId === doctor.id ? " doctor-card--active" : ""}`}
                  >
                    <button type="button" onClick={() => setSelectedDoctorId(doctor.id)}>
                      <strong>{doctor.fullName}</strong>
                      <span>{doctor.specialization}</span>
                      <span>{doctor.clinic}</span>
                      <small>Ближайшее окно: {formatDate(doctor.nextAvailableAt)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="doctors-panel">
            <h2>Оформить запись</h2>
            <form onSubmit={onBook} className="book-form">
              <label className="book-form-doctor-select">
                Выберите врача
                <select
                  value={selectedDoctorId}
                  onChange={(event) => setSelectedDoctorId(event.target.value)}
                  required
                >
                  <option value="">Выберите врача</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.fullName} — {doctor.specialization}
                    </option>
                  ))}
                </select>
              </label>
              <label className="book-form-selected-doctor">
                Выбранный врач
                <input
                  className="book-form-doctor-input"
                  value={
                    selectedDoctor ? `${selectedDoctor.fullName} (${selectedDoctor.specialization})` : ""
                  }
                  readOnly
                />
              </label>
              <label className="book-form-field">
                Дата и время
                {(selectedDoctor?.slots || []).length > 0 ? (
                  <select
                    value={selectedSlotId}
                    onChange={(e) => {
                      setSelectedSlotId(e.target.value);
                      const chosen = (selectedDoctor?.slots || []).find(
                        (slot) => slot.idAppointment === e.target.value,
                      );
                      setStartsAt(chosen?.visitStart || "");
                    }}
                    required
                    disabled={!selectedDoctorId}
                  >
                    <option value="">Выберите талон</option>
                    {(selectedDoctor?.slots || []).map((slot) => (
                      <option key={slot.idAppointment} value={slot.idAppointment}>
                        {formatDate(slot.visitStart)}
                        {slot.room ? `, каб. ${slot.room}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                    disabled={!selectedDoctorId}
                  />
                )}
              </label>
              <label className="book-form-field">
                Причина обращения
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={3}
                  rows={4}
                  required
                  disabled={!selectedDoctorId}
                />
              </label>
              {error && <div className="doctors-error">{error}</div>}
              <button type="submit" disabled={!selectedDoctorId || saving}>
                {saving ? "Отправляем..." : "Записаться через Госуслуги"}
              </button>
            </form>
          </article>
        </section>

        <section className="doctors-panel">
          <h2>Мои записи</h2>
          {appointments.length === 0 ? (
            <p className="doctors-empty">Записей пока нет.</p>
          ) : (
            <ul className="appointments-list">
              {appointments.map((appointment) => (
                <li key={appointment.id}>
                  <strong>{appointment.doctorName || appointment.doctorId || "Врач"}</strong>
                  <span>{appointment.specialization || "Специализация не указана"}</span>
                  <span>{formatDate(appointment.startsAt)}</span>
                  <span>Статус: {appointment.status}</span>
                  <small>{appointment.reason}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};
