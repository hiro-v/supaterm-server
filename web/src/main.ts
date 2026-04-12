import './styles.css';
import { getSessionQuery } from './session';
import { SupatermWorkbench } from './workbench';

const app = document.getElementById('app');
if (!app) {
  throw new Error('Missing app root');
}

const workbench = new SupatermWorkbench(app as HTMLDivElement, getSessionQuery(window.location.search));
workbench.mount();
