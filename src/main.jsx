import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './contexts/ThemeContext'
import { ProgressProvider } from './contexts/ProgressContext'
import { TimerProvider } from './contexts/TimerContext'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ProgressProvider>
          <TimerProvider>
            <App />
          </TimerProvider>
        </ProgressProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
