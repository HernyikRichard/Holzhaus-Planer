import { render } from 'preact';
import './app.css';
import { createStore } from '../ui/store';
import { createDefaultPlan } from '../model/defaults';
import { createUiStore } from './uiStore';
import { App } from './App';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  render(<App store={createStore(createDefaultPlan())} ui={createUiStore()} />, root);
}
