import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ProjectView from './ProjectView.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProjectView />
  </StrictMode>,
)
