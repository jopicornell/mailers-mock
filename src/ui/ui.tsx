import { createRoot } from 'react-dom/client';
import './index.css';

import Mails from './mails/Mails';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Mails />);
}

