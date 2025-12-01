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
	},

	'REACT_LOGIN': {
		id: 'react_login_new',
		name: '🚀 React Login (ESBuild)',
		code: `import React, { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        padding: '40px',
        borderRadius: '20px',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h2 style={{ color: 'white', marginBottom: '30px', textAlign: 'center' }}>Welcome Back</h2>
        <div style={{ marginBottom: '20px' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '16px',
              outline: 'none'
            }}
          />
        </div>
        <div style={{ marginBottom: '30px' }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '16px',
              outline: 'none'
            }}
          />
        </div>
        <button style={{
          width: '100%',
          padding: '12px',
          background: '#4facfe',
          border: 'none',
          borderRadius: '8px',
          color: 'white',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          transition: 'background 0.3s'
        }}>
          Sign In
        </button>
      </div>
    </div>
  );
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},

	'REACT_DASHBOARD': {
		id: 'react_dashboard_new',
		name: '🚀 React Dashboard (ESBuild)',
		code: `import React from 'react';

export default function Dashboard() {
  return (
    <div style={{
      padding: '20px',
      background: '#f0f2f5',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px'
      }}>
        {[
          { title: 'Users', value: '1,234', color: '#4facfe' },
          { title: 'Revenue', value: '$12,345', color: '#43e97b' },
          { title: 'Bounce Rate', value: '42%', color: '#fa709a' },
          { title: 'Active', value: '567', color: '#fddb92' }
        ].map((stat, i) => (
          <div key={i} style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>{stat.title}</h3>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>{stat.value}</div>
            <div style={{
              marginTop: '10px',
              height: '4px',
              background: '#eee',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: '70%',
                height: '100%',
                background: stat.color
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},

	'REACT_PRICING': {
		id: 'react_pricing_new',
		name: '🚀 React Pricing (ESBuild)',
		code: `import React from 'react';

export default function Pricing() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#111',
      fontFamily: 'system-ui, sans-serif',
      padding: '20px'
    }}>
      <div style={{
        background: '#222',
        padding: '40px',
        borderRadius: '24px',
        textAlign: 'center',
        color: 'white',
        border: '1px solid #333',
        maxWidth: '320px',
        width: '100%'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#888' }}>Pro Plan</h3>
        <div style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '20px' }}>
          $29<span style={{ fontSize: '16px', color: '#666' }}>/mo</span>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 30px 0', textAlign: 'left' }}>
          {['Unlimited Projects', 'AI Code Generation', 'Priority Support', 'Custom Domain'].map((feat, i) => (
            <li key={i} style={{ padding: '10px 0', borderBottom: '1px solid #333', color: '#ccc' }}>
              ✓ {feat}
            </li>
          ))}
        </ul>
        <button style={{
          width: '100%',
          padding: '16px',
          background: 'white',
          color: 'black',
          border: 'none',
          borderRadius: '12px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}>
          Get Started
        </button>
      </div>
    </div>
  );
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	}
};
