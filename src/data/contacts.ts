/** Contactos de UBU Latinoamérica por área. Nombres y números tal como los entregó UBU; no agregar ni modificar sin confirmación. */
export interface Person { id: string; name: string; first: string; phone: string; wa: string; msg: string }
export interface Area { id: string; name: string; hint: string; people: Person[] }

const p = (id: string, name: string, first: string, phone: string, msg: string): Person => ({ id, name, first, phone, wa: phone.replace(/\D/g, ''), msg });

export const areas: Area[] = [
  {
    id: 'gerencia', name: 'Gerencia', hint: 'Atención de gerencia',
    people: [p('fabio', 'Fabio Sandoval', 'Fabio', '+57 304 372 4012', 'Hola Fabio, me comunico desde la página web de UBU Latinoamérica para hablar con Gerencia.')],
  },
  {
    id: 'ventas', name: 'Ventas', hint: 'Cotizaciones y pedidos',
    people: [
      p('pedro', 'Pedro Pablo Bustamante', 'Pedro Pablo', '+57 312 375 6667', 'Hola Pedro Pablo, quiero cotizar productos de UBU Latinoamérica. Los encontré en la página web.'),
      p('roberto', 'Roberto Franco', 'Roberto', '+57 316 123 4566', 'Hola Roberto, quiero cotizar productos de UBU Latinoamérica. Los encontré en la página web.'),
    ],
  },
  {
    id: 'cartera', name: 'Facturación y cartera', hint: 'Consultas de facturación y cartera',
    people: [p('maria', 'María Antonela Garzón', 'María Antonela', '+57 320 866 8129', 'Hola María Antonela, tengo una consulta de facturación o cartera con UBU Latinoamérica.')],
  },
];

export const allPeople = areas.flatMap((a) => a.people.map((x) => ({ ...x, area: a.name })));
export const waLink = (person: Person, text?: string) => `https://wa.me/${person.wa}?text=${encodeURIComponent(text ?? person.msg)}`;
export const telLink = (person: Person) => `tel:+${person.wa}`;
