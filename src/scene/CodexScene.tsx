/**
 * The persistent scene — mounted once, never torn down. The SceneDirector's
 * mood light, the descending camera, the torch, and (soon) the embers and post
 * live here as the constants; the Spine swaps the five depths beneath them.
 */
import { SceneDirector } from './SceneDirector'
import { CameraRig } from './CameraRig'
import { Spine } from './Spine'
import { Torch } from './torch/Torch'
import { Post } from './post/Post'
import { PerfWatchdog } from './PerfWatchdog'

export function CodexScene() {
  return (
    <>
      <SceneDirector />
      <CameraRig />
      <Spine />
      <Torch pageZ={0} />
      <Post />
      <PerfWatchdog />
    </>
  )
}
