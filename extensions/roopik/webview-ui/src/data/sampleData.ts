/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Sandbox } from '../types';

// Hardcoded sample sandbox for Phase 1 testing - React component with Vite
export const SAMPLE_SANDBOX: Sandbox = {
	id: 'sandbox_sample_001',
	name: 'Sample Login Button',
	files: {
		'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sample Component</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`,
		'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`,
		'src/App.tsx': `import './App.css';

function App() {
  return (
    <div className="container">
      <button className="login-btn">
        <span>Login</span>
      </button>
    </div>
  );
}

export default App;`,
		'src/index.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

#root {
  width: 100%;
  height: 100vh;
}`,
		'src/App.css': `.container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.login-btn {
  padding: 16px 48px;
  font-size: 18px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.2s ease;
  position: relative;
}

.login-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #7c8ef7 0%, #8b5bb8 100%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.login-btn:hover::before {
  opacity: 1;
}

.login-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.6);
}

.login-btn:active {
  transform: scale(0.98);
}

.login-btn span {
  position: relative;
  z-index: 1;
}`,
		'package.json': `{
  "name": "sandbox-sample-001",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0"
  }
}`
	},
	entryPoint: 'src/main.tsx',
	compiled: {
		html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sample Component</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .login-btn {
      padding: 16px 48px;
      font-size: 18px;
      font-weight: 600;
      color: white;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      transition: all 0.2s ease;
      position: relative;
    }
    .login-btn::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 12px;
      background: linear-gradient(135deg, #7c8ef7 0%, #8b5bb8 100%);
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .login-btn:hover::before {
      opacity: 1;
    }
    .login-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 25px rgba(102, 126, 234, 0.6);
    }
    .login-btn:active {
      transform: scale(0.98);
    }
    .login-btn span {
      position: relative;
      z-index: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <button class="login-btn"><span>Login</span></button>
  </div>
</body>
</html>`,
		css: '',
		js: ''
	},
	position: { x: 100, y: 100 },
	size: { width: 400, height: 300 },
	isSelected: false,
	isVisible: true,
	createdAt: Date.now(),
	updatedAt: Date.now()
};
