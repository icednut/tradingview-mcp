import { register } from '../router.js';
import * as core from '../../core/tab.js';

register('tab', {
  description: 'Tab management (list, new, open-chart, close, close-id, switch)',
  subcommands: new Map([
    ['list', {
      description: 'List all open chart tabs',
      handler: () => core.list(),
    }],
    ['new', {
      description: 'Open a new chart tab (optionally into a saved layout)',
      options: {
        layout: { type: 'string', description: 'Saved layout name to open, or "new" for a blank layout' },
      },
      handler: (opts) => core.newTab({ layout: opts.layout }),
    }],
    ['open-chart', {
      description: 'Open a saved chart by chart id (no layout-name lookup)',
      options: {
        timeout: { type: 'string', description: 'Milliseconds to wait for the chart API (default 40000)' },
      },
      handler: (opts, positionals) => {
        if (positionals[0] === undefined) throw new Error('Chart id required. Usage: tv tab open-chart <chartId>');
        return core.openChartById({
          chartId: positionals[0],
          ...(opts.timeout === undefined ? {} : { timeoutMs: Number(opts.timeout) }),
        });
      },
    }],
    ['close', {
      description: 'Close the current tab',
      handler: () => core.closeTab(),
    }],
    ['close-id', {
      description: 'Close a specific CDP target via /json/close/<targetId>',
      handler: (opts, positionals) => {
        if (positionals[0] === undefined) throw new Error('Target id required. Usage: tv tab close-id <targetId>');
        return core.closeTargetById({ targetId: positionals[0] });
      },
    }],
    ['switch', {
      description: 'Switch to a tab by index',
      handler: (opts, positionals) => {
        if (positionals[0] === undefined) throw new Error('Index required. Usage: tv tab switch 0');
        return core.switchTab({ index: positionals[0] });
      },
    }],
  ]),
});
