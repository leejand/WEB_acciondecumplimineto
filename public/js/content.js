/* Contenido académico de la guía: La acción de cumplimiento (art. 87 CP, Ley 393 de 1997 y art. 146 CPACA).
   Basado en el trabajo de Yury Carolina Ochoa Álvarez (2026). Para editar textos se toca este archivo, no app.js. */

const WORK = {
  title: 'La acción de cumplimiento',
  subtitle: 'Art. 87 de la Constitución, Ley 393 de 1997 y art. 146 del CPACA',
  author: 'Yury Carolina Ochoa Álvarez',
  year: 2026,
};

// Capítulos (rutas). `tab` es la etiqueta corta de la barra de pestañas; `color`, el de los lomos del índice.
const CHAPTERS = [
  { n: '01', path: '/inicio', title: 'Concepto', short: 'Inicio', tab: 'Inicio', text: 'Qué es, de dónde viene y para qué sirve.', color: 'orange' },
  { n: '02', path: '/procedencia', title: 'Procedencia', short: 'Procedencia', tab: 'Procedencia', text: 'Qué se puede exigir, quién demanda y la renuencia.', color: 'blue' },
  { n: '03', path: '/tramite', title: 'Trámite', short: 'Trámite', tab: 'Trámite', text: 'Caducidad, competencia, términos, fallo y desacato.', color: 'yellow' },
  { n: '04', path: '/comparativo', title: 'Diferencias', short: 'Diferencias', tab: 'Diferencias', text: 'Frente a la tutela, la popular y la nulidad. Temas avanzados.', color: 'green' },
  { n: '05', path: '/casos', title: 'Casos', short: 'Casos', tab: 'Casos', text: 'Casos resueltos, guía práctica, modelos y preguntas frecuentes.', color: 'pink' },
  { n: '06', path: '/evaluacion', title: 'Evaluación', short: 'Evaluación', tab: 'Evaluación', text: 'Tu demanda va a reparto. El despacho decide tus preguntas.', color: 'ink' },
];

// ---------- 1. Introducción y marco normativo ----------
const INTRO = 'La acción de cumplimiento es el mecanismo constitucional con el que cualquier persona puede pedir a un juez que ordene a una autoridad, o a un particular que ejerce funciones públicas, cumplir un deber que le imponen una ley o un acto administrativo y que ha dejado de cumplir.';

const LEVELS = [
  { k: 'cp', tag: 'Constitucional', short: 'Art. 87 CP', norma: 'Art. 87 de la Constitución Política de 1991',
    text: '«Toda persona podrá acudir ante la autoridad judicial para hacer efectivo el cumplimiento de una ley o un acto administrativo. En caso de prosperar la acción, la sentencia ordenará a la autoridad renuente el cumplimiento del deber omitido.»' },
  { k: 'ley', tag: 'Legal · ley de desarrollo', short: 'Ley 393', norma: 'Ley 393 de 1997',
    text: 'Desarrolla el art. 87: objeto, principios, legitimación, requisito de renuencia, improcedencia, trámite, fallo, impugnación y desacato.' },
  { k: 'cpaca', tag: 'Procesal contencioso', short: 'Art. 146', norma: 'Art. 146 de la Ley 1437 de 2011 (CPACA)',
    text: 'La enuncia como medio de control: toda persona puede acudir ante la jurisdicción de lo contencioso administrativo, previa constitución de renuencia, para hacer efectivo el cumplimiento de normas con fuerza material de ley o de actos administrativos.' },
];

const CPACA_POINTS = [
  { t: 'Renuencia previa', d: 'Exigencia de renuencia como requisito previo (art. 161, num. 3, que remite al art. 8 de la Ley 393).' },
  { t: 'Competencias', d: 'Distribución de competencias entre jueces y tribunales (arts. 152 y 155).' },
  { t: 'Supletoriedad', d: 'Aplicación supletoria de sus reglas en lo no regulado (art. 30 de la Ley 393).' },
];

const BEFORE_1991 = 'Antes de 1991 no existía en Colombia una vía judicial directa para obligar a la administración a cumplir la ley. El constituyente la creó para garantizar la eficacia material del ordenamiento y el principio de Estado social de derecho: de poco sirve una norma vigente que la autoridad obligada se niega a ejecutar.';

// ---------- 2. Concepto, naturaleza y finalidad ----------
const CONCEPT = {
  text: 'Es una acción constitucional, pública, residual y de condena. Su objeto es que el juez ordene a la autoridad renuente ejecutar un deber concreto previsto en una norma con fuerza material de ley o en un acto administrativo (art. 1 de la Ley 393).',
  quote: 'El derecho de toda persona a exigir el cumplimiento de los deberes que la ley o los actos administrativos imponen a una autoridad que se muestra renuente.',
  source: 'Corte Constitucional, Sentencia C-157 de 1998',
};

const TRAITS = [
  { t: 'Es pública', d: 'Cualquier persona puede ejercerla, sin acreditar un interés particular.', ref: 'art. 4', color: 'orange' },
  { t: 'No es de legalidad', d: 'No discute si la norma es válida, sino que exige que se cumpla. Presupone una norma vigente.', ref: 'art. 87 CP', color: 'blue' },
  { t: 'Es residual', d: 'No procede si existe otro instrumento judicial idóneo, ni para proteger derechos amparables por tutela.', ref: 'art. 9', color: 'yellow' },
  { t: 'No es indemnizatoria', d: 'El juez ordena cumplir, pero no reconoce perjuicios. Estos se reclaman por las vías ordinarias.', ref: 'art. 24', color: 'green' },
  { t: 'Es preferente', d: 'Se tramita con prelación sobre los demás asuntos, salvo la tutela.', ref: 'art. 11', color: 'pink' },
];

const PRINCIPLES = ['Publicidad', 'Prevalencia del derecho sustancial', 'Economía', 'Celeridad', 'Eficacia', 'Gratuidad'];

const PURPOSES = [
  { t: 'Eficacia material', d: 'Garantizar la eficacia material del ordenamiento jurídico.' },
  { t: 'Participación ciudadana', d: 'Permitir la participación ciudadana en el control de la gestión pública.' },
];

// ---------- 3. Objeto ----------
const OBJECT = [
  { t: 'Normas con fuerza material de ley', d: 'Leyes, decretos con fuerza de ley (decretos ley y decretos legislativos) y, según la jurisprudencia, otras normas de rango legal. La expresión «fuerza material de ley» del art. 146 del CPACA recoge este alcance.' },
  { t: 'Actos administrativos', d: 'Generales (decretos reglamentarios, acuerdos, ordenanzas, resoluciones) y particulares, siempre que estén vigentes.' },
];

const DUTY = [
  { k: 'claro', d: 'Su contenido se entiende sin interpretaciones complejas.' },
  { k: 'expreso', d: 'Está escrito en la norma, no se deduce.' },
  { k: 'exigible', d: 'No está sometido a plazo o condición pendiente.' },
];

const DUTY_EXAMPLE = 'Un acuerdo municipal ordena al alcalde reglamentar el uso de un parque dentro de los seis meses siguientes a su publicación. Vencido el plazo sin reglamentación, el deber es claro, expreso y exigible, y procede la acción.';

const NOT_ENFORCEABLE = [
  { t: 'Normas constitucionales', why: 'El art. 87 se refiere a «una ley o un acto administrativo». La Sección Quinta excluye los mandatos constitucionales (6 de noviembre de 2013, rad. 25000-23-41-000-2013-01964-01). Tres magistrados salvaron el voto en la C-158 de 1998.', via: 'Tutela, acción popular o acción de inconstitucionalidad, según el caso' },
  { t: 'Normas que establecen gastos', why: 'Prohibición expresa del parágrafo del art. 9.', via: 'Gestión presupuestal o vías ordinarias' },
  { t: 'Normas derogadas, suspendidas o anuladas', why: 'La acción presupone un deber vigente. Si el acto está suspendido provisionalmente en un proceso de nulidad, el trámite se suspende (art. 18).', via: 'Ninguna, mientras no recobre vigencia' },
  { t: 'Principios, fines o facultades discrecionales', why: 'No contienen un mandato imperativo e inobjetable.', via: 'Control político o ciudadano' },
  { t: 'Obligaciones de un contrato', why: 'Un contrato no es una ley ni un acto administrativo, y existe otro instrumento judicial idóneo (art. 9, inc. 2).', via: 'Controversias contractuales (art. 141 del CPACA) o proceso ejecutivo' },
  { t: 'Sentencias judiciales', why: 'No son normas ni actos administrativos.', via: 'Proceso ejecutivo, incidente de desacato o cumplimiento ante el mismo juez' },
  { t: 'Pago de sumas de dinero', why: 'Implican gasto, y la acción no es indemnizatoria (arts. 9 y 24).', via: 'Nulidad y restablecimiento, reparación directa o proceso ejecutivo' },
  { t: 'Discutir la legalidad', why: 'La acción presupone una norma válida y vigente.', via: 'Nulidad o nulidad y restablecimiento' },
  { t: 'Derechos fundamentales', why: 'Improcedencia expresa (art. 9, inc. 1).', via: 'Tutela' },
];

// Regla práctica: si alguna respuesta es negativa, la acción probablemente fracasará.
const PRACTICAL_RULE = [
  '¿Existe una norma vigente con rango de ley o un acto administrativo?',
  '¿De ella surge un deber concreto?',
  '¿El deber está a cargo de una autoridad identificable?',
  '¿Se puede cumplir sin crear un gasto nuevo?',
];

// ---------- 4. Legitimación ----------
const STANDING = {
  active: {
    title: 'Por activa', ref: 'art. 4 de la Ley 393',
    lead: 'Cualquier persona natural o jurídica puede ejercer la acción, sin acreditar un interés particular. Además, la ley legitima expresamente a:',
    items: [
      'Los servidores públicos: el Procurador General, los procuradores delegados, regionales y provinciales, el Defensor del Pueblo y sus delegados, los personeros municipales, el Contralor General y los contralores territoriales.',
      'Las organizaciones sociales.',
      'Las organizaciones no gubernamentales.',
    ],
    note: 'No se requiere abogado: la acción se puede presentar directamente, e incluso de forma verbal (art. 10).',
  },
  passive: {
    title: 'Por pasiva', ref: 'arts. 5 y 6',
    items: [
      'Cualquier autoridad pública a la que corresponda cumplir el deber omitido, sin importar la rama del poder: la Corte declaró inexequible la palabra «administrativa» del art. 5 (C-157 de 1998). Si el demandante se equivoca de autoridad, la demandada debe informarlo y el juez notificar a la competente.',
      'Los particulares, solo cuando actúan en ejercicio de funciones públicas y únicamente respecto de esas funciones (art. 6), como las cámaras de comercio frente al registro mercantil o las notarías.',
    ],
  },
};

const PRIVATE_REQS = [
  { t: 'Ejerce una función pública', d: 'No basta con que su actividad sea de interés general: debe ser una función asignada por la ley o delegada por la administración.' },
  { t: 'El deber corresponde a esa función', d: 'La acción no alcanza su actividad privada: una cámara de comercio responde por su función registral, no por sus arrendamientos ni sus relaciones laborales.' },
  { t: 'Norma con fuerza de ley o acto administrativo', d: 'Y el deber debe ser claro, expreso y exigible, como en cualquier acción de cumplimiento.' },
  { t: 'Renuencia al sujeto demandado', d: 'Si se demanda al particular y a la autoridad, la renuencia debe dirigirse a ambos (principio de congruencia).' },
];

const PRIVATES = [
  { p: 'Cámaras de comercio', f: 'Llevar el registro mercantil y los demás registros públicos a su cargo', a: 'Superintendencia de Industria y Comercio' },
  { p: 'Notarios', f: 'Dar fe pública', a: 'Superintendencia de Notariado y Registro' },
  { p: 'Curadores urbanos', f: 'Estudiar, tramitar y expedir licencias urbanísticas', a: 'Alcaldía y órganos de control del municipio o distrito' },
  { p: 'Federación Nacional de Cafeteros', f: 'Recaudo y administración de la contribución parafiscal (Fondo Nacional del Café)', a: 'Ministerio del ramo y Contraloría' },
];

const WHOM_TO_SUE = [
  { t: 'Al particular', d: 'Cuando el deber es directo y el demandante quiere una orden inmediata sobre quien debe ejecutarlo.' },
  { t: 'A la autoridad de control', d: 'Cuando la norma le asigna el deber de exigir el cumplimiento, o cuando el particular es renuente de forma reiterada y se requiere una autoridad con poder sancionatorio.' },
  { t: 'A ambos', d: 'Constituyendo en renuencia a los dos. Reduce el riesgo de que la demanda fracase por haber elegido mal al sujeto pasivo.' },
];

// ---------- 5. Renuencia e improcedencia ----------
const RENUENCIA = {
  text: 'Antes de demandar, el interesado debe pedir por escrito a la autoridad que cumpla el deber. Solo si esta se ratifica en el incumplimiento, o no contesta dentro de los diez días siguientes, queda constituida en renuencia y procede la acción.',
  why: 'La renuencia le da a la administración la oportunidad de cumplir o de justificar su inactividad antes de ser llevada ante el juez.',
  whySource: 'Corte Constitucional, C-1194 de 2001',
  identity: [
    'Invoca las mismas normas cuyo cumplimiento se pedirá al juez.',
    'Pide el mismo deber concreto.',
    'La firma la misma persona que luego demanda.',
    'Se dirige a la misma autoridad que será demandada.',
    'Queda prueba de su envío o radicación.',
  ],
  warning: 'Una simple petición de información no constituye renuencia: el escrito debe reclamar expresamente el cumplimiento del deber legal.',
  exception: 'Se puede prescindir de la renuencia cuando esperar el término exponga al demandante a un perjuicio irremediable. Debe sustentarse en la demanda (art. 8, inc. 2).',
};

const IMPROCEDENCE = [
  { t: 'Derechos protegibles por tutela', d: 'Si lo que se busca es proteger un derecho fundamental, la vía es la tutela. El juez debe darle ese trámite.' },
  { t: 'Otro instrumento judicial', d: 'No procede cuando el afectado tiene o tuvo otro medio judicial para lograr el cumplimiento, salvo que su uso cause un perjuicio grave e inminente. La Corte declaró inexequible la expresión «la norma o» de este inciso (C-193 de 1998).' },
  { t: 'Normas que establecen gastos', d: 'Parágrafo del art. 9, exequible en la C-157 de 1998: el presupuesto autoriza un gasto, pero no obliga a ejecutarlo, y el juez no puede reemplazar a las autoridades presupuestales.' },
];

// ---------- 6. Caducidad y competencia ----------
const CADUCIDAD = 'La acción de cumplimiento no caduca: se puede ejercer en cualquier tiempo mientras el deber siga vigente e incumplido. La sentencia hace tránsito a cosa juzgada, pero el art. 7 admite una nueva acción por el mismo deber frente a otras autoridades o por incumplimientos posteriores.';

const COMPETENCE = {
  nacional: { label: 'Nacional', first: 'Tribunal administrativo', firstRef: 'art. 152 del CPACA', second: 'Consejo de Estado, Sección Quinta', who: 'Ministerios, superintendencias, departamentos administrativos y demás autoridades del orden nacional.' },
  territorial: { label: 'Territorial o local', first: 'Juzgado administrativo', firstRef: 'art. 155 del CPACA', second: 'Tribunal administrativo del distrito', who: 'Autoridades departamentales, distritales, municipales o locales, y particulares con funciones públicas en ese ámbito.' },
};

// ---------- 7. Trámite ----------
const STEPS = [
  { n: 'Solicitud', ref: 'art. 10', days: null, unit: 'Puede ser verbal', color: 'paper',
    d: 'Identificación del solicitante, la norma o el acto incumplido, los hechos, la autoridad o el particular renuente, la prueba de la renuencia, las pruebas y el juramento de no haber presentado otra solicitud por los mismos hechos.' },
  { n: 'Admisión', ref: 'art. 12', days: 3, unit: 'días para decidir', color: 'yellow',
    d: 'Si falta un requisito, el solicitante tiene dos días para corregirlo; si no lo hace, se rechaza. También se rechaza de plano si falta la prueba de la renuencia, salvo el perjuicio irremediable.' },
  { n: 'Notificación', ref: 'art. 13', days: 3, unit: 'días para hacerse parte', color: 'paper',
    d: 'El auto admisorio se notifica dentro de los tres días siguientes. La autoridad tiene tres días para hacerse parte, allegar pruebas o solicitar su práctica.' },
  { n: 'Pruebas e informes', ref: 'art. 17', days: 5, unit: 'días como máximo', color: 'blue',
    d: 'El juez puede pedir informes y documentos, que se entregan en un plazo de uno a cinco días. La renuencia injustificada a entregarlos genera responsabilidad disciplinaria.' },
  { n: 'Fallo', ref: 'art. 13', days: 20, unit: 'días desde la admisión', color: 'orange',
    d: 'El auto admisorio le informa a la autoridad que el fallo se dictará dentro de los veinte días siguientes a la admisión.' },
  { n: 'Cumplimiento', ref: 'art. 21', days: 10, unit: 'días hábiles, como máximo', color: 'paper',
    d: 'Si prospera, la sentencia ordena cumplir el deber dentro de un plazo que no puede exceder de diez días hábiles desde la ejecutoria.' },
  { n: 'Impugnación', ref: 'arts. 26 y 27', days: 3, unit: 'días para impugnar', color: 'green',
    d: 'Pueden impugnar el solicitante, la autoridad renuente y el Defensor del Pueblo. Por regla, en efecto suspensivo. El superior decide dentro de los diez días siguientes.' },
  { n: 'Desacato', ref: 'arts. 25 y 29', days: null, unit: 'El juez conserva la competencia', color: 'ink',
    d: 'Si el fallo no se cumple, el juez se dirige al superior y abre el disciplinario. El incumplimiento es desacato, que sanciona el mismo juez y se revisa en consulta.' },
];

const SPECIAL = [
  { ref: 'art. 19', t: 'Cumple durante el proceso', d: 'El proceso termina y se condena en costas.', color: 'yellow' },
  { ref: 'art. 18', t: 'Acto suspendido', d: 'Si el acto está suspendido provisionalmente en un proceso de nulidad, el trámite se suspende.', color: 'blue' },
  { ref: 'art. 20', t: 'Excepción de inconstitucionalidad', d: 'El juez la resuelve en el fallo, salvo que la norma ya haya pasado control de constitucionalidad.', color: 'pink' },
  { ref: 'art. 16', t: 'Providencias recurribles', d: 'Solo la sentencia y el auto que niega pruebas; este último admite reposición.', color: 'green' },
];

// ---------- 8. Sentencia, impugnación y desacato ----------
const RULING = [
  'Identificar al solicitante y a la autoridad o el particular renuente.',
  'Determinar con precisión el deber omitido.',
  'Ordenar su cumplimiento en un plazo que no exceda de diez días hábiles desde la ejecutoria.',
  'Si hay mérito, ordenar que se investigue la conducta del renuente en lo disciplinario y lo penal.',
  'Decidir sobre las costas.',
];

const RULING_NOTES = [
  { t: 'Si se niega', d: 'No se puede presentar una nueva solicitud con el mismo objeto frente a la misma autoridad (art. 7). La sentencia se notifica personalmente (art. 22).' },
  { t: 'Sin perjuicios', d: 'Como la acción no es indemnizatoria, los daños se reclaman por la vía ordinaria (art. 24), normalmente por reparación directa.' },
  { t: 'Temeridad', d: 'Si la misma acción se presenta ante varios jueces, se rechazan todas, y el abogado puede ser suspendido en su tarjeta profesional (art. 28).' },
];

// ---------- 9. Diferencias con otras acciones ----------
const COMPARE = {
  criteria: ['Fundamento', 'Qué protege', 'Qué se ataca', 'Requisito previo', 'Caducidad', 'Indemnización'],
  actions: [
    { k: 'cumplimiento', name: 'Acción de cumplimiento', color: 'orange', values: ['Art. 87 CP, Ley 393 de 1997, art. 146 CPACA', 'La eficacia de una ley o de un acto administrativo', 'La omisión de un deber legal', 'Constitución en renuencia', 'No caduca', 'No'] },
    { k: 'tutela', name: 'Tutela', color: 'blue', values: ['Art. 86 CP, Decreto 2591 de 1991', 'Derechos fundamentales', 'Acción u omisión que vulnera un derecho fundamental', 'Ninguno (subsidiariedad)', 'Inmediatez', 'Excepcional'] },
    { k: 'popular', name: 'Acción popular', color: 'green', values: ['Art. 88 CP, Ley 472 de 1998', 'Derechos e intereses colectivos', 'Acción u omisión que amenaza un derecho colectivo', 'Requerimiento previo a la autoridad (art. 144 CPACA)', 'No caduca mientras subsista la amenaza', 'No (incentivo derogado)'] },
    { k: 'nulidad', name: 'Nulidad y restablecimiento', color: 'yellow', values: ['Art. 138 CPACA', 'Un derecho subjetivo lesionado por un acto', 'Un acto administrativo ilegal', 'Conciliación y recursos obligatorios', 'Cuatro meses, por regla', 'Sí'] },
  ],
  key: 'En la nulidad se pide al juez que retire una norma ilegal; en el cumplimiento se le pide que haga eficaz una norma vigente.',
};

// ---------- 10. Temas avanzados ----------
const ADVANCED = [
  { n: '10.1', t: 'La prohibición de normas que establecen gastos',
    d: ['Es el límite más discutido. La Corte lo declaró exequible: la aprobación de un gasto en una ley es necesaria pero no suficiente para ejecutarlo, porque las apropiaciones son autorizaciones máximas, no órdenes de gastar (C-157 de 1998). Tres magistrados salvaron el voto.',
      'El Consejo de Estado aplica un criterio funcional: si el gasto ya está presupuestado, la improcedencia cede (Sección Cuarta, 16 de octubre de 1998, ACU-474). Si la orden implica un gasto no presupuestado, la acción es improcedente, como frente a un concurso de méritos (Sección Quinta, 19 de agosto de 2021) o un reajuste pensional (Sección Quinta, 26 de febrero de 2004).'],
    tip: 'Estrategia del litigante: pruebe que existe apropiación presupuestal (certificado de disponibilidad, presupuesto aprobado) o que el deber no implica erogación, como expedir un reglamento, inscribir, certificar o resolver un trámite.' },
  { n: '10.2', t: 'La excepción de inconstitucionalidad como defensa',
    d: ['La autoridad puede justificar el incumplimiento alegando que la norma es contraria a la Constitución (art. 20). El juez la resuelve en el fallo, pero no puede alegarse frente a normas que ya superaron el control de constitucionalidad. Si prospera, la acción se niega, pero la norma sigue vigente para los demás casos.'] },
  { n: '10.3', t: 'Cosa juzgada y nueva acción',
    d: ['Se puede presentar una nueva acción por el mismo deber frente a otra autoridad, o por un incumplimiento posterior, pero no frente a hechos ya decididos respecto de la misma autoridad (art. 7). El fallo que niega por falta de renuencia no es de fondo: se puede constituir de nuevo y volver a demandar.'] },
  { n: '10.4', t: 'Cumplimiento durante el proceso y costas',
    d: ['Si la autoridad cumple antes del fallo, el proceso termina y se condena en costas (art. 19). Esto desincentiva que la administración espere a ser demandada para cumplir. Si el cumplimiento es parcial, el juez se pronuncia sobre lo pendiente.'] },
  { n: '10.5', t: 'Congruencia entre la renuencia y la demanda',
    d: ['El juez solo puede pronunciarse sobre las normas y la autoridad que fueron objeto de la renuencia. Si la demanda agrega normas o autoridades nuevas, se rechaza frente a ellas (Sección Quinta, 12 de febrero de 2015). Es el error más frecuente en la práctica.'] },
  { n: '10.6', t: 'Actos administrativos particulares',
    d: ['Procede para exigir actos particulares, como una resolución que ordena una actuación a favor de una persona. Pero si el cumplimiento se traduce en un pago, choca con la prohibición de gastos y con la existencia de otro medio judicial. Si el acto presta mérito ejecutivo, la vía es el proceso ejecutivo.'] },
  { n: '10.7', t: 'Relación con la nulidad',
    d: ['Si el acto está suspendido provisionalmente en un proceso de nulidad, el trámite se suspende (art. 18). Si es declarado nulo, desaparece el deber y la acción pierde su objeto.'] },
  { n: '10.8', t: 'Servidores públicos como demandantes',
    d: ['Pueden ejercer la acción a nombre propio o como representantes de una persona jurídica, salvo frente a su propio incumplimiento (C-158 de 1998). Un personero puede demandar al alcalde, pero un alcalde no puede demandarse a sí mismo.'] },
];

// ---------- 11. Guía práctica ----------
const CHECKLIST = [
  'Identifiqué la norma exacta (ley, decreto o acto administrativo), con número, fecha y artículo.',
  'Verifiqué que está vigente: no ha sido derogada, anulada ni suspendida.',
  'El deber es claro, expreso y exigible, y el plazo para cumplirlo, si lo hay, ya venció.',
  'Identifiqué la autoridad o el particular obligado a cumplirlo.',
  'El cumplimiento no implica un gasto no presupuestado, o tengo prueba de la apropiación.',
  'No se trata de un derecho fundamental (tutela) ni existe otro medio judicial idóneo.',
  'Radiqué el escrito de renuencia y conservo la constancia con fecha.',
  'Pasaron diez días sin respuesta, o la autoridad se ratificó en el incumplimiento.',
  'La demanda invoca las mismas normas, el mismo deber y la misma autoridad del escrito de renuencia, y la firma la misma persona.',
  'Determiné el juez competente según el nivel de la autoridad (nacional: tribunal; territorial: juzgado).',
  'No he presentado otra acción por los mismos hechos.',
];

// Los textos entre [corchetes] se resaltan como campos por diligenciar.
const MODELS = {
  renuencia: {
    title: 'Escrito de renuencia',
    text: `[Ciudad], [fecha]

Señor(a) [NOMBRE Y CARGO DE LA AUTORIDAD]
[ENTIDAD]
[Dirección o correo electrónico de radicación]

Asunto: Solicitud de cumplimiento de deber legal — constitución en renuencia (art. 8 de la Ley 393 de 1997)

[NOMBRE], identificado(a) con cédula de ciudadanía N.° [___], de manera respetuosa le solicito que dé cumplimiento al deber contenido en el artículo [__] de [LEY / DECRETO / ACUERDO / RESOLUCIÓN N.° __ de __], que dispone: "[TRANSCRIPCIÓN LITERAL DE LA NORMA]".

Hechos: 1. [Fecha de expedición y vigencia de la norma]. 2. [Plazo previsto para cumplir y su vencimiento]. 3. [Prueba de que la autoridad no ha cumplido].

Petición: que dentro de los diez (10) días siguientes al recibo de esta solicitud, [ENTIDAD] cumpla el deber señalado, consistente en [DESCRIPCIÓN CONCRETA DE LA CONDUCTA EXIGIDA].

Esta solicitud se presenta para constituir en renuencia a la entidad, en los términos del art. 8 de la Ley 393 de 1997 y del numeral 3 del art. 161 del CPACA. Si no hay respuesta o si la entidad se ratifica en el incumplimiento, acudiré a la acción de cumplimiento.

Notificaciones: [dirección física y correo electrónico].

Atentamente,
[FIRMA] — [NOMBRE] — C. C. [___]`,
    tip: 'Transcriba la norma, no la parafrasee; pida una conducta concreta y no una «respuesta»; radique en la ventanilla o el correo oficial y guarde la constancia; y firme usted mismo si será el demandante.',
  },
  demanda: {
    title: 'Demanda',
    text: `Señor(a) JUEZ ADMINISTRATIVO DEL CIRCUITO DE [CIUDAD] (REPARTO)
/ MAGISTRADOS DEL TRIBUNAL ADMINISTRATIVO DE [__] (REPARTO)

Referencia: Acción de cumplimiento
Demandante: [NOMBRE]
Demandado: [ENTIDAD / AUTORIDAD]

[NOMBRE], mayor de edad, identificado(a) con C. C. N.° [___], domiciliado(a) en [___], en ejercicio de la acción consagrada en el artículo 87 de la Constitución Política, desarrollada por la Ley 393 de 1997 y prevista en el artículo 146 del CPACA, presento demanda de cumplimiento contra [ENTIDAD], representada por [NOMBRE Y CARGO], con base en lo siguiente:

I. Norma incumplida. Artículo [__] de [NORMA], que dispone: "[TRANSCRIPCIÓN]".

II. Hechos. 1. [Vigencia de la norma]. 2. [Deber a cargo de la demandada y plazo]. 3. [Incumplimiento]. 4. El [fecha] radiqué solicitud de cumplimiento ante la entidad. 5. Transcurrieron más de diez días sin respuesta / la entidad respondió el [fecha] negándose a cumplir.

III. Pretensiones. 1. Que se declare que [ENTIDAD] ha incumplido el deber contenido en el artículo [__] de [NORMA]. 2. Que se ordene a [ENTIDAD] cumplir dicho deber, consistente en [CONDUCTA CONCRETA], dentro del plazo que fije el despacho, sin exceder de diez (10) días hábiles (art. 21 de la Ley 393). 3. Que se condene en costas a la demandada.

IV. Procedencia. a) La norma está vigente y contiene un mandato imperativo e inobjetable. b) Se constituyó en renuencia a la entidad (art. 8 de la Ley 393 y art. 161.3 del CPACA). c) No se trata de derechos amparables por tutela ni existe otro medio judicial idóneo (art. 9). d) El cumplimiento no exige un gasto no presupuestado [explicar].

V. Competencia. [Juzgado / Tribunal], por tratarse de una autoridad del orden [nacional / territorial] (arts. 152 o 155 del CPACA).

VI. Pruebas. 1. Copia de la norma incumplida. 2. Copia del escrito de renuencia con constancia de radicación. 3. Respuesta de la entidad, si la hubo. 4. [Otras].

VII. Juramento. Manifiesto bajo la gravedad del juramento que no he presentado otra solicitud de cumplimiento por los mismos hechos ante otra autoridad judicial (art. 10 de la Ley 393).

VIII. Notificaciones. Demandante: [dirección y correo]. Demandada: [buzón de notificaciones judiciales de la entidad].

[FIRMA] — [NOMBRE] — C. C. [___] — [T. P. N.° ___, si actúa por medio de abogado]`,
    tip: 'En la demanda no agregue normas, pretensiones ni autoridades que no estén en el escrito de renuencia. Si necesita incluirlas, constituya primero una nueva renuencia.',
  },
};

// ---------- 12. Casos prácticos (hipotéticos) ----------
// verdict: índice dentro de VERDICTS.
const VERDICTS = ['Procede', 'Improcedente', 'Se rechaza'];
const CASES = [
  { t: 'El reglamento que nunca se expidió', verdict: 0, label: 'Procede',
    facts: 'Un acuerdo del concejo municipal ordena al alcalde expedir, dentro de los seis meses siguientes, el reglamento de uso de los parques públicos. Han pasado diez meses. Una veeduría ciudadana radica un escrito de renuencia y el alcalde no responde.',
    analysis: 'Hay un acto administrativo vigente, con un mandato claro (expedir el reglamento), expreso (está en el texto) y exigible (venció el plazo). Expedir un reglamento no implica un gasto. La renuencia se constituyó por silencio. La veeduría está legitimada como organización social.',
    solution: 'Procede ante el juez administrativo, por tratarse de una autoridad municipal. El fallo debe ordenar la expedición del reglamento en un plazo de hasta diez días hábiles.' },
  { t: 'El concurso de méritos', verdict: 1, label: 'Improcedente por gastos',
    facts: 'Un sindicato pide que se ordene a una entidad territorial convocar el concurso de méritos para proveer los cargos en provisionalidad, como lo exige la ley de carrera administrativa. No hay recursos presupuestados para el concurso.',
    analysis: 'Aunque el deber legal existe, convocar el concurso implica un gasto no presupuestado.',
    solution: 'Improcedente por el parágrafo del art. 9 (Sección Quinta, 19 de agosto de 2021). La estrategia correcta habría sido probar la apropiación, o pedir los actos previos que no implican gasto, como la actualización del manual de funciones.' },
  { t: 'La renuencia mal constituida', verdict: 2, label: 'Rechazo',
    facts: 'Un abogado radica un derecho de petición a nombre de su cliente en el que pregunta a un ministerio «en qué estado está la reglamentación de la Ley X». Luego, el cliente demanda en cumplimiento al ministerio y a una superintendencia, y pide cumplir los arts. 3 y 5 de esa ley.',
    analysis: 'Hay tres errores: la petición pide información, no el cumplimiento; la superintendencia no fue requerida; y la petición no invocó los arts. 3 y 5.',
    solution: 'Se rechaza frente a la superintendencia y frente a las normas no invocadas, y probablemente también frente al ministerio, por falta de renuencia. Como no hay fallo de fondo, el cliente puede constituir una renuencia correcta y demandar de nuevo.' },
  { t: 'La pensión reconocida que no se paga', verdict: 1, label: 'Otra vía',
    facts: 'Una entidad expidió una resolución que reconoce una pensión y ordena su inclusión en nómina, pero no la ha pagado. El pensionado presenta una acción de cumplimiento.',
    analysis: 'El cumplimiento se traduce en el pago de sumas de dinero, lo que choca con la prohibición de gastos. Además, el acto presta mérito ejecutivo: existe otro instrumento judicial.',
    solution: 'Improcedente. Las vías idóneas son el proceso ejecutivo y, si se afecta el mínimo vital de una persona de especial protección, la tutela.' },
  { t: 'La cámara de comercio', verdict: 0, label: 'Procede',
    facts: 'Una norma legal ordena a las cámaras de comercio publicar cierta información del registro en su página web. Una cámara no lo hace pese a la solicitud de un ciudadano.',
    analysis: 'La cámara de comercio es un particular, pero el registro público es una función pública delegada. La acción procede frente a esa función (art. 6).',
    solution: 'Procede, siempre que se haya constituido la renuencia y que el deber no implique un gasto no previsto.' },
  { t: 'El deber que vulnera un derecho fundamental', verdict: 1, label: 'Tutela',
    facts: 'Una ley obliga a una entidad de salud pública a entregar cierto medicamento a los pacientes con una enfermedad específica. Un paciente no lo recibe y su salud se deteriora.',
    analysis: 'El deber legal existe, pero lo que está en juego es el derecho fundamental a la salud.',
    solution: 'La acción de cumplimiento es improcedente (art. 9, inc. 1), y el juez debe darle trámite de tutela.' },
];

// ---------- 13. Preguntas frecuentes ----------
const FAQ = [
  { q: '¿Se necesita abogado?', a: 'No. Cualquier persona puede presentarla directamente, incluso de forma verbal en los casos que la ley prevé (arts. 4 y 10 de la Ley 393).' },
  { q: '¿Un derecho de petición sirve como renuencia?', a: 'Solo si reclama expresamente el cumplimiento de un deber legal concreto, invoca la norma y se dirige a la autoridad que luego se demandará. Una petición de información o de consulta no constituye renuencia.' },
  { q: '¿Y si la autoridad responde dentro de los diez días, pero no cumple?', a: 'Si se ratifica en el incumplimiento, queda constituida en renuencia y se puede demandar de inmediato. Si promete cumplir, conviene esperar el plazo razonable que indique.' },
  { q: '¿Se puede demandar sin agotar la renuencia?', a: 'Solo cuando esperar los diez días exponga al demandante a un perjuicio irremediable, sustentado en la demanda (art. 8). La excepción se aplica de forma restrictiva.' },
  { q: '¿Hay término de caducidad?', a: 'No. Puede ejercerse en cualquier tiempo mientras el deber siga vigente e incumplido (art. 7).' },
  { q: '¿Procede contra el Congreso o contra un juez?', a: 'La C-157 de 1998 declaró inexequible la palabra «administrativa» del art. 5: procede contra cualquier autoridad que incumpla una ley o un acto administrativo. Pero no sirve para hacer cumplir sentencias ni para discutir decisiones jurisdiccionales.' },
  { q: '¿Se puede exigir el cumplimiento de la Constitución?', a: 'No. La Sección Quinta del Consejo de Estado excluye los mandatos constitucionales, porque el art. 87 se refiere a leyes y actos administrativos.' },
  { q: '¿Se puede pedir el pago de dinero?', a: 'Por regla, no: el parágrafo del art. 9 impide exigir normas que establecen gastos, y la acción no es indemnizatoria (art. 24). La excepción es que se pruebe que el gasto ya está presupuestado.' },
  { q: '¿Procede contra particulares?', a: 'Solo contra los que ejercen funciones públicas, y únicamente respecto de esas funciones (art. 6). También puede dirigirse contra la autoridad competente para imponerle el cumplimiento al particular.' },
  { q: '¿Qué juez es competente?', a: 'Autoridad nacional: el tribunal administrativo en primera instancia y la Sección Quinta del Consejo de Estado en segunda. Autoridad territorial: el juez administrativo y, en segunda, el tribunal (arts. 152 y 155 del CPACA).' },
  { q: '¿Cuánto dura el proceso?', a: 'La ley prevé el fallo dentro de los veinte días siguientes a la admisión (art. 13) y la segunda instancia en diez días (art. 27). En la práctica los términos pueden extenderse, pero el trámite tiene prelación.' },
  { q: '¿Se pueden pedir medidas cautelares?', a: 'La Ley 393 no regula un sistema cautelar propio. Su art. 15 permite ordenar el cumplimiento inmediato, sin esperar el fallo, cuando de las pruebas surja una violación grave o inminente de derechos. Por remisión del art. 30, algunos jueces aplican el régimen cautelar del CPACA.' },
  { q: '¿Qué pasa si la autoridad cumple durante el proceso?', a: 'El proceso termina y se condena en costas a la autoridad (art. 19).' },
  { q: '¿Y si se niega por falta de renuencia?', a: 'Como no hay decisión de fondo, puede constituir una renuencia correcta y presentar una nueva acción.' },
  { q: '¿Qué pasa si la autoridad no cumple el fallo?', a: 'El juez requiere al superior para que haga cumplir la orden y abra el proceso disciplinario. El demandante puede promover un incidente de desacato, que se revisa en consulta (arts. 25 y 29).' },
  { q: '¿Puedo presentar la misma acción ante varios jueces?', a: 'No. Las acciones se rechazan, y el abogado que las promueva puede ser suspendido en su tarjeta profesional (art. 28).' },
  { q: '¿Qué la diferencia de una acción popular por omisión?', a: 'La popular protege derechos colectivos amenazados, aunque no exista un deber legal específico. La de cumplimiento exige un deber legal concreto. Si el incumplimiento amenaza un derecho colectivo, ambas pueden proceder.' },
  { q: '¿Sirve para exigir que se reglamente una ley?', a: 'Sí, cuando la ley ordena reglamentarla en un plazo determinado y este venció. Si no fija plazo, el deber puede no ser exigible, porque la potestad reglamentaria es discrecional en cuanto a su oportunidad.' },
];

// ---------- 14. Jurisprudencia ----------
const CASE_LAW = [
  { court: 'cc', p: 'C-157 de 1998', who: 'M. P. Antonio Barrera Carbonell y Hernando Herrera Vergara', r: 'Declara exequible la Ley 393 en lo esencial y define la acción. Avala la improcedencia frente a normas que establecen gastos. Inexequible la palabra «administrativa» del art. 5.' },
  { court: 'cc', p: 'C-158 de 1998', who: 'M. P. Vladimiro Naranjo Mesa', r: 'Los servidores públicos pueden ejercer la acción, salvo frente a su propio incumplimiento. Tres salvamentos por dejar fuera los mandatos constitucionales.' },
  { court: 'cc', p: 'C-193 de 1998', who: 'Corte Constitucional', r: 'Inexequible la expresión «la norma o» del inciso 2 del art. 9, sobre la existencia de otro instrumento judicial.' },
  { court: 'cc', p: 'C-1194 de 2001', who: 'Corte Constitucional', r: 'La renuencia le da a la administración la oportunidad de cumplir o de justificar su inactividad antes del proceso.' },
  { court: 'ce', p: 'Sección Cuarta · 16 oct. 1998', who: 'Exp. ACU-474 · C. P. Delio Gómez Leyva', r: 'La improcedencia por gastos cede si se prueba que el gasto está presupuestado.' },
  { court: 'ce', p: 'Sección Quinta · 26 feb. 2004', who: 'Rad. 76001-23-31-000-2003-04052-01 · C. P. Darío Quiñones Pinilla', r: 'Aplica la prohibición del parágrafo del art. 9 a una pretensión de pago de un reajuste pensional.' },
  { court: 'ce', p: 'Sección Quinta · 29 jul. 2004', who: 'Rad. 52001-23-31-000-2004-0748-01 · C. P. María Noemí Hernández Pinzón', r: 'Fija las exigencias de identidad entre la petición de renuencia y la demanda.' },
  { court: 'ce', p: 'Sección Quinta · 16 ago. 2012', who: 'Rad. 68001-23-31-000-2011-00817-01 · C. P. Alberto Yepes Barreiro', r: 'Precisa los requisitos mínimos del escrito de renuencia.' },
  { court: 'ce', p: 'Sección Quinta · 6 nov. 2013', who: 'Rad. 25000-23-41-000-2013-01964-01 · C. P. Alberto Yepes Barreiro', r: 'Excluye las normas constitucionales; niega la acción cuando la demora no es atribuible a la entidad.' },
  { court: 'ce', p: 'Sección Quinta · 12 jun. 2014', who: 'Rad. 25000-23-41-000-2014-00118-01 · C. P. Alberto Yepes Barreiro', r: 'Sistematiza los requisitos: norma vigente, mandato imperativo e inobjetable, renuencia y subsidiariedad.' },
  { court: 'ce', p: 'Sección Quinta · 12 feb. 2015', who: 'Rad. 70001-23-33-000-2014-00196-01 · C. P. Susana Buitrago Valencia', r: 'Congruencia: se rechaza frente a la autoridad y las normas que no fueron objeto de renuencia.' },
  { court: 'ce', p: 'Sección Quinta · 19 ago. 2021', who: 'Rad. 17001-23-33-000-2021-00020-01 · C. P. Carlos Enrique Moreno Rubio', r: 'Convocar un concurso de méritos implica un gasto no presupuestado: la acción es improcedente.' },
];

// ---------- 15. Conclusiones ----------
const CONCLUSIONS = [
  'Creada por el art. 87 de la Constitución, desarrollada por la Ley 393 de 1997 y enunciada en el art. 146 del CPACA, permite a cualquier persona exigir que la administración cumpla la ley y sus propios actos.',
  'No discute la validez de la norma, sino su eficacia: presupone un deber vigente, claro, expreso y exigible a cargo de la autoridad demandada.',
  'La constitución en renuencia es su requisito central, y la mayoría de las demandas fracasan por no acreditarla en debida forma.',
  'Es residual: no procede cuando hay tutela u otro medio judicial, ni para exigir normas que establecen gastos.',
  'Junto con la nulidad y restablecimiento, completa el control judicial de la administración: una corrige lo que la administración hizo mal; la otra, lo que dejó de hacer.',
];

const REFERENCES = [
  'Constitución Política de Colombia [Const.]. (1991). Art. 87.',
  'Ley 393 de 1997. Por la cual se desarrolla el artículo 87 de la Constitución Política. 29 de julio de 1997. D. O. N.° 43.096.',
  'Ley 1437 de 2011. Código de Procedimiento Administrativo y de lo Contencioso Administrativo. Arts. 146, 152, 155 y 161. D. O. N.° 47.956.',
  'Ley 2080 de 2021. Por medio de la cual se reforma el CPACA. 25 de enero de 2021.',
  'Corte Constitucional. (1998). Sentencias C-157, C-158 y C-193 de 1998.',
  'Corte Constitucional. (2001). Sentencia C-1194 de 2001.',
  'Consejo de Estado, Sección Cuarta. (1998, 16 de octubre). Exp. ACU-474 (C. P. Delio Gómez Leyva).',
  'Consejo de Estado, Sección Quinta. Sentencias de 2004, 2012, 2013, 2014, 2015 y 2021 citadas en esta guía.',
  'Santofimio Gamboa, J. O. (2017). Compendio de derecho administrativo. Universidad Externado de Colombia.',
  'Jurisdicción de lo Contencioso Administrativo, Villavicencio. Sentencia rad. 50001-33-33-000-2021-00277-00.',
];
