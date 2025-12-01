/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * New Sample Components for ESBuild Pipeline
 *
 * These samples demonstrate the new pipeline capabilities.
 */

export const NEW_SAMPLE_COMPONENTS = {
	'REACT_COUNTER': {
		id: 'react_counter_new',
		name: '🚀 React Counter (ESBuild)',
		code: `import React, { useState } from 'react';

export default function Counter() {
	const [count, setCount] = useState(0);

	return (
		<div style={{
			padding: '40px',
			fontFamily: 'system-ui, sans-serif',
			background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
			minHeight: '100vh',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center'
		}}>
			<div style={{
				background: 'white',
				padding: '40px',
				borderRadius: '20px',
				boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
				textAlign: 'center'
			}}>
				<h1 style={{ fontSize: '48px', marginBottom: '20px', color: '#333' }}>
					{count}
				</h1>
				<div style={{ display: 'flex', gap: '10px' }}>
					<button
						onClick={() => setCount(count - 1)}
						style={{
							padding: '12px 24px',
							fontSize: '18px',
							background: '#ef4444',
							color: 'white',
							border: 'none',
							borderRadius: '8px',
							cursor: 'pointer'
						}}
					>
						−
					</button>
					<button
						onClick={() => setCount(0)}
						style={{
							padding: '12px 24px',
							fontSize: '18px',
							background: '#6b7280',
							color: 'white',
							border: 'none',
							borderRadius: '8px',
							cursor: 'pointer'
						}}
					>
						Reset
					</button>
					<button
						onClick={() => setCount(count + 1)}
						style={{
							padding: '12px 24px',
							fontSize: '18px',
							background: '#10b981',
							color: 'white',
							border: 'none',
							borderRadius: '8px',
							cursor: 'pointer'
						}}
					>
						+
					</button>
				</div>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},

	'REACT_TODO': {
		id: 'react_todo_new',
		name: '🚀 React Todo List (ESBuild)',
		code: `import React, { useState } from 'react';

export default function TodoList() {
	const [todos, setTodos] = useState(['Learn ESBuild', 'Build amazing apps']);
	const [input, setInput] = useState('');

	const addTodo = () => {
		if (input.trim()) {
			setTodos([...todos, input]);
			setInput('');
		}
	};

	return (
		<div style={{
			padding: '40px',
			fontFamily: 'system-ui, sans-serif',
			background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
			minHeight: '100vh'
		}}>
			<div style={{
				maxWidth: '500px',
				margin: '0 auto',
				background: 'white',
				padding: '30px',
				borderRadius: '20px',
				boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
			}}>
				<h1 style={{ marginBottom: '20px', color: '#333' }}>Todo List</h1>
				<div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
					<input
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyPress={(e) => e.key === 'Enter' && addTodo()}
						placeholder="Add a todo..."
						style={{
							flex: 1,
							padding: '12px',
							fontSize: '16px',
							border: '2px solid #e5e7eb',
							borderRadius: '8px'
						}}
					/>
					<button
						onClick={addTodo}
						style={{
							padding: '12px 24px',
							background: '#10b981',
							color: 'white',
							border: 'none',
							borderRadius: '8px',
							cursor: 'pointer',
							fontSize: '16px'
						}}
					>
						Add
					</button>
				</div>
				<ul style={{ listStyle: 'none', padding: 0 }}>
					{todos.map((todo, index) => (
						<li
							key={index}
							style={{
								padding: '12px',
								background: '#f3f4f6',
								marginBottom: '8px',
								borderRadius: '8px',
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center'
							}}
						>
							<span>{todo}</span>
							<button
								onClick={() => setTodos(todos.filter((_, i) => i !== index))}
								style={{
									background: '#ef4444',
									color: 'white',
									border: 'none',
									padding: '4px 12px',
									borderRadius: '4px',
									cursor: 'pointer'
								}}
							>
								×
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},

	'REACT_CARD': {
		id: 'react_card_new',
		name: '🚀 React Card (ESBuild)',
		code: `import React from 'react';

export default function Card() {
	return (
		<div style={{
			padding: '40px',
			fontFamily: 'system-ui, sans-serif',
			background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
			minHeight: '100vh',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center'
		}}>
			<div style={{
				background: 'white',
				padding: '40px',
				borderRadius: '20px',
				boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
				maxWidth: '400px'
			}}>
				<div style={{
					width: '100%',
					height: '200px',
					background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
					borderRadius: '12px',
					marginBottom: '20px'
				}} />
				<h2 style={{ marginBottom: '10px', color: '#333' }}>
					Beautiful Card
				</h2>
				<p style={{ color: '#666', lineHeight: '1.6' }}>
					This card is rendered using the new ESBuild pipeline!
					No Babel, instant compilation, 200× less memory! 🚀
				</p>
				<button style={{
					marginTop: '20px',
					padding: '12px 24px',
					background: '#667eea',
					color: 'white',
					border: 'none',
					borderRadius: '8px',
					cursor: 'pointer',
					fontSize: '16px',
					width: '100%'
				}}>
					Click Me!
				</button>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	}
};
