const Joi = require("joi");

function buildSchemas({ maxSymptoms, maxSymptomLength }) {
  const diagnosisPredictSchema = Joi.object({
    symptoms: Joi.array().items(Joi.string().max(maxSymptomLength)).min(1).max(maxSymptoms).required(),
    answers: Joi.object().unknown(true).default({}),
    round: Joi.number().integer().min(1).max(10).default(1),
  }).unknown(true);

  const diagnosisPreliminarySchema = Joi.object({
    answers: Joi.object().unknown(true).default({}),
  }).unknown(true);

  const doctorConfirmSchema = Joi.object({
    feedbackId: Joi.number().integer().positive().required(),
    confirmedDiseaseId: Joi.number().integer().positive().required(),
  });
  const appointmentCreateSchema = Joi.object({
    doctorId: Joi.string().trim().min(1).max(128).required(),
    startsAt: Joi.string().isoDate().required(),
    reason: Joi.string().trim().min(3).max(1000).required(),
    idAppointment: Joi.string().trim().max(128),
    idLpu: Joi.string().trim().max(128),
    idPat: Joi.string().trim().max(128),
  });
  const appointmentStatusUpdateSchema = Joi.object({
    appointmentId: Joi.string().trim().min(1).max(128).required(),
    status: Joi.string().valid("booked", "confirmed", "cancelled", "completed").required(),
  });

  const avatarUploadSchema = Joi.object({
    data: Joi.string().trim().min(32).required(),
    mimeType: Joi.string().max(160).optional().allow("", null),
  });

  const profileNestedSchema = Joi.object({
    surname: Joi.string().trim().max(100),
    firstName: Joi.string().trim().max(100),
    name: Joi.string().trim().max(100),
    middleName: Joi.string().trim().max(100),
    patronymic: Joi.string().trim().max(100),
    birthDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
    gender: Joi.string().trim().max(20),
    phone: Joi.string().trim().max(32),
    region: Joi.string().trim().max(255),
    avatarUrl: Joi.string().trim().max(512).allow(""),
  }).unknown(true);

  const profileUpdateSchema = Joi.object({
    newPassword: Joi.string().min(8).max(128).allow(""),
    currentPassword: Joi.string().max(128).allow(""),
    surname: Joi.string().trim().max(100),
    firstName: Joi.string().trim().max(100),
    name: Joi.string().trim().max(100),
    middleName: Joi.string().trim().max(100),
    patronymic: Joi.string().trim().max(100),
    birthDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
    gender: Joi.string().trim().max(20),
    phone: Joi.string().trim().max(32),
    region: Joi.string().trim().max(255),
    avatarUrl: Joi.string().trim().max(512).allow(""),
    profile: profileNestedSchema,
  }).unknown(true);

  return {
    diagnosisPredictSchema,
    diagnosisPreliminarySchema,
    doctorConfirmSchema,
    appointmentCreateSchema,
    appointmentStatusUpdateSchema,
    avatarUploadSchema,
    profileUpdateSchema,
  };
}

const KEY_QUESTIONS = [
  {
    id: "visible_changes",
    question:
      "Есть ли видимые изменения на теле (сыпь, покраснения, отёки, пятна, язвочки и т.д.) или симптомы только внутренние (чувствуются, но ничего не видно)?",
    type: "single",
    options: [
      { value: "visible", label: "Есть видимые изменения" },
      { value: "internal", label: "Только внутренние ощущения" },
      { value: "both", label: "И видимые, и внутренние" },
    ],
  },
  {
    id: "onset",
    question: "Когда начались симптомы?",
    type: "single",
    options: [
      { value: "sudden", label: "Внезапно (за часы или 1-2 дня)" },
      { value: "gradual", label: "Постепенно (за недели или месяцы)" },
    ],
  },
  {
    id: "main_complaint",
    question: "Как бы вы описали интенсивность ощущений прямо сейчас?",
    type: "single",
    options: [
      { value: "mild", label: "Ощущения слабые, фоновые" },
      { value: "severe", label: "Ощущения сильные, явные" },
    ],
  },
  {
    id: "pattern",
    question: "Симптомы постоянные или приходят приступами (волнами)?",
    type: "single",
    options: [
      { value: "constant", label: "Постоянные" },
      { value: "episodic", label: "Приступообразные (приходят и уходят)" },
    ],
  },
  {
    id: "fever",
    question: "Есть ли повышение температуры тела?",
    type: "single",
    options: [
      { value: "no", label: "Нет" },
      { value: "low", label: "Небольшое (до 38°C)" },
      { value: "high", label: "Высокая (38°C и выше)" },
    ],
  },
  {
    id: "weakness",
    question: "Есть ли сильная слабость, усталость или снижение работоспособности?",
    type: "single",
    options: [
      { value: "no", label: "Нет" },
      { value: "mild", label: "Лёгкая" },
      { value: "severe", label: "Выраженная" },
    ],
  },
  {
    id: "triggers",
    question: "Есть ли явная связь симптомов с чем-то (еда, нагрузка, стресс, время суток, погода и т.д.)?",
    type: "single",
    options: [
      { value: "no", label: "Нет явной связи" },
      { value: "yes", label: "Да, есть связь" },
    ],
  },
  {
    id: "pain_character",
    question: "Если есть боль - какого она характера?",
    type: "single",
    options: [
      { value: "none", label: "Нет боли" },
      { value: "sharp", label: "Острая/Пронизывающая: Обычно возникает внезапно, четко локализована" },
      { value: "dull", label: "Тупая/Ноющая: Часто постоянная, глубокая, трудно определить точное местоположение" },
      { value: "throbbing", label: "Пульсирующая: Связана с воспалением или нарушением кровообращения" },
      {
        value: "burning",
        label: "Жгучая/Горящая: Типична для повреждения нервов (нейропатическая) или сильного раздражения кожи",
      },
      { value: "stabbing", label: "Режущая/Колющая: Часто указывает на острое воспаление или спазм" },
      { value: "pressing", label: "Давящая/Сжимающая: Характерна для стенокардии или внутренних органов" },
      { value: "band_like", label: "Опоясывающая: Боль, распространяющаяся вокруг тела" },
    ],
  },
  {
    id: "additional_systems",
    question: "Есть ли проблемы со стороны определенных систем организма? (выберите все подходящие)",
    type: "multi",
    options: [
      { value: "none", label: "Нет" },
      { value: "respiratory", label: "Дыхательная (кашель, одышка)" },
      { value: "digestive", label: "Пищеварительная (тошнота, боли в животе)" },
      { value: "urinary", label: "Мочевыделительная" },
      { value: "joints", label: "Суставы" },
      { value: "neurological", label: "Нервная система (головокружение, онемение)" },
    ],
  },
  {
    id: "dynamics",
    question: "Как изменилось самочувствие с момента появления симптомов?",
    type: "single",
    options: [
      { value: "worsening", label: "Стало хуже" },
      { value: "stable", label: "Примерно одинаково" },
      { value: "improving", label: "Стало лучше" },
    ],
  },
];

module.exports = {
  buildSchemas,
  KEY_QUESTIONS,
};
