/** Magazzino stilizzato: scaffalature, scatole, pallet e carrello. Solo forme geometriche; i colori stanno in accedi.css (classi `ill-`). */
function Scatola({ x, y, w, h, tono = 1 }: { x: number; y: number; w: number; h: number; tono?: 1 | 2 | 3 | 4 }) {
  return (
    <g className={`ill-sc ill-t${tono}`}>
      <rect x={x} y={y} width={w} height={h} rx="2" />
      <path d={`M${x + w / 2} ${y}v${Math.min(10, h / 2)}`} className="ill-nastro" />
    </g>
  );
}

function Scaffale({ x, larghezza, travi, montanti }: { x: number; larghezza: number; travi: number[]; montanti: number[] }) {
  return (
    <g className="ill-scaffale">
      {montanti.map((m) => (
        <rect key={m} x={m} y="48" width="6" height="252" />
      ))}
      {travi.map((y) => (
        <rect key={y} x={x} y={y} width={larghezza} height="6" rx="1" />
      ))}
    </g>
  );
}

export function IllustrazioneMagazzino() {
  return (
    <svg className="illustrazione" viewBox="0 0 520 330" role="img" aria-label="Scaffalature con scatole, un pallet e un carrello in un magazzino">
      {/* pavimento */}
      <rect className="ill-pavimento" x="0" y="300" width="520" height="2" />
      <path className="ill-corsia" d="M0 316H520" />

      {/* scaffale in secondo piano */}
      <g opacity="0.55">
        <Scaffale x={282} larghezza={132} travi={[130, 210]} montanti={[282, 344, 408]} />
        <Scatola x={292} y={92} w={40} h={38} tono={3} />
        <Scatola x={352} y={104} w={44} h={26} tono={4} />
        <Scatola x={290} y={174} w={52} h={36} tono={2} />
        <Scatola x={350} y={166} w={46} h={44} tono={3} />
      </g>

      {/* scaffale in primo piano */}
      <Scaffale x={40} larghezza={206} travi={[130, 210, 290]} montanti={[40, 140, 240]} />
      <Scatola x={52} y={90} w={50} h={40} tono={2} />
      <Scatola x={110} y={100} w={22} h={30} tono={4} />
      <g className="ill-evidenza">
        <Scatola x={150} y={84} w={66} h={46} tono={1} />
        <path className="ill-etichetta" d="M160 112h20M160 118h14M190 110v10M194 110v10M198 110v10M203 110v10" />
      </g>
      <Scatola x={54} y={176} w={40} h={34} tono={3} />
      <Scatola x={100} y={160} w={34} h={50} tono={1} />
      <Scatola x={150} y={170} w={82} h={40} tono={2} />
      <Scatola x={52} y={240} w={60} h={50} tono={4} />
      <Scatola x={118} y={252} w={18} h={38} tono={2} />
      <Scatola x={148} y={232} w={86} h={58} tono={3} />

      {/* pallet con colli */}
      <g>
        <Scatola x={428} y={248} w={36} h={38} tono={2} />
        <Scatola x={468} y={252} w={32} h={34} tono={4} />
        <Scatola x={438} y={212} w={52} h={36} tono={1} />
        <g className="ill-pallet">
          <rect x="422" y="286" width="84" height="6" rx="1" />
          <rect x="426" y="292" width="8" height="8" />
          <rect x="460" y="292" width="8" height="8" />
          <rect x="494" y="292" width="8" height="8" />
        </g>
      </g>

      {/* carrello: l'unico elemento che si muove */}
      <g className="ill-carrello">
        <Scatola x={288} y={236} w={38} h={30} tono={3} />
        <Scatola x={330} y={244} w={30} h={22} tono={2} />
        <Scatola x={294} y={214} w={24} h={22} tono={4} />
        <g className="ill-telaio">
          <rect x="282" y="266" width="86" height="7" rx="2" />
          <path d="M362 266l8-52h-16M296 273v10M354 273v10" fill="none" />
        </g>
        <g className="ill-ruota">
          <circle cx="296" cy="291" r="9" />
          <circle cx="354" cy="291" r="9" />
          <circle cx="296" cy="291" r="2.500" className="ill-mozzo" />
          <circle cx="354" cy="291" r="2.500" className="ill-mozzo" />
        </g>
      </g>
    </svg>
  );
}
