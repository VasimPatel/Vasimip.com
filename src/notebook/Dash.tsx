import type { DashProps } from './types'
import Idle from './poses/Idle'
import Walk from './poses/Walk'
import Tuck from './poses/Tuck'
import Land from './poses/Land'
import Fight from './poses/Fight'
import Spray from './poses/Spray'
import Dangle from './poses/Dangle'
import Throw from './poses/Throw'
import Wave from './poses/Wave'
import Cheer from './poses/Cheer'
import Trip from './poses/Trip'
import Think from './poses/Think'
import Sneeze from './poses/Sneeze'
import Vault from './poses/Vault'
import Wallrun from './poses/Wallrun'
import Rope from './poses/Rope'
import Swing from './poses/Swing'
import Slide from './poses/Slide'
import Surf from './poses/Surf'
import Shove from './poses/Shove'
import Punch from './poses/Punch'
import Peek from './poses/Peek'
import Hang from './poses/Hang'
import Knock from './poses/Knock'

export default function Dash(p: DashProps) {
  let activePose
  switch (p.pose) {
    case 'idle':
      activePose = <Idle headTilt={p.headTilt} lookXf={p.lookXf} lookY={p.lookY} eyeR={p.eyeR} />
      break
    case 'walk':
      activePose = <Walk />
      break
    case 'tuck':
      activePose = <Tuck />
      break
    case 'land':
      activePose = <Land />
      break
    case 'fight':
      activePose = <Fight />
      break
    case 'spray':
      activePose = <Spray lookXf={p.lookXf} lookY={p.lookY} />
      break
    case 'dangle':
      activePose = <Dangle />
      break
    case 'throw':
      activePose = <Throw />
      break
    case 'wave':
      activePose = <Wave />
      break
    case 'cheer':
      activePose = <Cheer />
      break
    case 'trip':
      activePose = <Trip />
      break
    case 'think':
      activePose = <Think />
      break
    case 'sneeze':
      activePose = <Sneeze />
      break
    case 'vault':
      activePose = <Vault />
      break
    case 'wallrun':
      activePose = <Wallrun />
      break
    case 'rope':
      activePose = <Rope />
      break
    case 'swing':
      activePose = <Swing />
      break
    case 'slide':
      activePose = <Slide />
      break
    case 'surf':
      activePose = <Surf />
      break
    case 'shove':
      activePose = <Shove />
      break
    case 'punch':
      activePose = <Punch />
      break
    case 'peek':
      activePose = <Peek />
      break
    case 'hang':
      activePose = <Hang />
      break
    case 'knock':
      activePose = <Knock />
      break
    case 'hidden':
    case 'dive':
      activePose = null
      break
  }
  return (
    <svg viewBox="-60 -75 120 130" width="104" height="113" style={{ overflow: 'visible', display: 'block' }}>
      <g style={{ transform: p.faceTf, transition: 'transform .22s ease-out', transformBox: 'fill-box', transformOrigin: '50% 88%' }}>
        {activePose}
      </g>
    </svg>
  )
}
