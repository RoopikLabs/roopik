import { useState } from 'react';
import './App.css';

// VS Code API for PostMessage communication
declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

function App() {
	const [messages, setMessages] = useState<string[]>([]);

	const sendToExtension = () => {
		vscode.postMessage({
			type: 'alert',
			text: 'Hello from React app!'
		});
		addMessage('Sent: Hello from React app!');
	};

	const testLog = () => {
		vscode.postMessage({
			type: 'log',
			text: 'React app console test'
		});
		addMessage('Logged to extension console');
	};

	const addMessage = (msg: string) => {
		setMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
	};

	return (
		<div className="app">
			<header>
				<h1>Roopik Canvas</h1>
				<p>React + Vite + PostMessage working!</p>
			</header>

			<div className="controls">
				<button onClick={sendToExtension}>
					Send Message to Extension
				</button>
				<button onClick={testLog}>
					Log to Console
				</button>
			</div>

			<div className="messages">
				<h3>Activity Log:</h3>
				{messages.length === 0 ? (
					<p>Click buttons to test communication...</p>
				) : (
					<ul>
						{messages.map((msg, i) => (
							<li key={i}>{msg}</li>
						))}
					</ul>
				)}
			</div>

			<div className="info">
				<p>This is a React app running inside VS Code webview</p>
				<p>Built with Vite for hot reload during development</p>
			</div>
		</div>
	);
}

export default App;
