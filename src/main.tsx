import { createRoot } from 'react-dom/client'
import './notebook/styles.css'
import App from './App'

// No <StrictMode>: the notebook controller wires global listeners, timer chains,
// and a WebAudio context in componentDidMount. StrictMode's dev double-mount would
// churn those; the original .dc runtime mounts once, so we match it.
createRoot(document.getElementById('root')!).render(<App />)
