import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'
import './assets/main.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('找不到 #root 挂载节点')
}

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider delayDuration={0}>
      <App />
    </TooltipProvider>
  </StrictMode>
)
