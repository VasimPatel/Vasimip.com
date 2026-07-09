import { renderToStaticMarkup } from 'react-dom/server'
import Cover from '../src/notebook/pages/Cover'
import Intro from '../src/notebook/pages/Intro'
import About from '../src/notebook/pages/About'
import Work from '../src/notebook/pages/Work'
import Skills from '../src/notebook/pages/Skills'
import Contact from '../src/notebook/pages/Contact'
import CoverRenderer from '../src/notebook/CoverRenderer'
import PageRenderer from '../src/notebook/PageRenderer'
import { DEFAULT_DOC } from '../src/notebook/doc/defaultDoc'

export interface ParityCase {
  name: string
  oldMarkup: string
  newMarkup: string
}

export function renderParityCases(): ParityCase[] {
  const noop = () => {}
  const [intro, about, work, skills, contact] = DEFAULT_DOC.pages

  return [
    {
      name: 'cover',
      oldMarkup: renderToStaticMarkup(<Cover style={{}} onOpen={noop} />),
      newMarkup: renderToStaticMarkup(<CoverRenderer cover={DEFAULT_DOC.cover} style={{}} onOpen={noop} />),
    },
    {
      name: 'intro',
      oldMarkup: renderToStaticMarkup(<Intro style={{}} />),
      newMarkup: renderToStaticMarkup(<PageRenderer page={intro} style={{}} flags={{}} />),
    },
    {
      name: 'about',
      oldMarkup: renderToStaticMarkup(<About style={{}} />),
      newMarkup: renderToStaticMarkup(<PageRenderer page={about} style={{}} flags={{}} />),
    },
    {
      name: 'work',
      oldMarkup: renderToStaticMarkup(<Work style={{}} />),
      newMarkup: renderToStaticMarkup(<PageRenderer page={work} style={{}} flags={{}} />),
    },
    {
      name: 'skills-off',
      oldMarkup: renderToStaticMarkup(<Skills style={{}} skillsOn={false} />),
      newMarkup: renderToStaticMarkup(<PageRenderer page={skills} style={{}} flags={{}} />),
    },
    {
      name: 'skills-on',
      oldMarkup: renderToStaticMarkup(<Skills style={{}} skillsOn={true} />),
      newMarkup: renderToStaticMarkup(<PageRenderer page={skills} style={{}} flags={{ skillsRevealed: true }} />),
    },
    {
      name: 'contact',
      oldMarkup: renderToStaticMarkup(<Contact style={{}} />),
      newMarkup: renderToStaticMarkup(<PageRenderer page={contact} style={{}} flags={{}} />),
    },
  ]
}
