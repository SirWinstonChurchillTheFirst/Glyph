import { createRoot } from 'react-dom/client'
import { getLanguage } from '../../shared/i18n'
import { App } from './App'
import './styles.css'

// The main process writes its own messages (client and network errors) and needs to know the language.
document.documentElement.lang = getLanguage()
void window.api.setLanguage(getLanguage())

createRoot(document.getElementById('root')!).render(<App />)
