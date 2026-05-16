import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ComponentView from './ComponentView.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ComponentView />
  </StrictMode>,
)
