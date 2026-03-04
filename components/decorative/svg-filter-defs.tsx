export function SvgFilterDefs() {
  return (
    <svg className="absolute w-0 h-0" aria-hidden="true">
      <defs>
        <filter id="hand-drawn" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="turbulence"
            baseFrequency="0.03"
            numOctaves="4"
            seed="1"
            result="turbulence"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="turbulence"
            scale="2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id="hand-drawn-strong" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="turbulence"
            baseFrequency="0.04"
            numOctaves="3"
            seed="2"
            result="turbulence"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="turbulence"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id="paper-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="4"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix
            type="saturate"
            values="0"
            in="noise"
            result="gray-noise"
          />
          <feBlend
            in="SourceGraphic"
            in2="gray-noise"
            mode="multiply"
            result="blend"
          />
          <feComponentTransfer in="blend">
            <feFuncA type="linear" slope="0.03" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  )
}
