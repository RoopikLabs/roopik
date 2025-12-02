/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * New Sample Components for ESBuild Pipeline + migrated legacy samples.
 */

interface SampleDefinition {
	id: string;
	name: string;
	code: string;
	dependencies: Record<string, string>;
}

export const NEW_SAMPLE_COMPONENTS: Record<string, SampleDefinition> = {
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

	'LEGACY_DASHBOARD_ANALYTICS': {
		id: 'dashboard_analytics_legacy',
		name: 'Legacy Dashboard Analytics',
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
	},

	// Legacy Mode 1 samples (converted to new structure)
	'LEGACY_SIMPLE_BUTTON': {
		id: 'button_sample_001',
		name: 'Simple Button',
		code: `import React from 'react';

export default function Component() {
	return (
		<div style={{ padding: '40px', textAlign: 'center' }}>
			<h1 style={{ color: '#007acc', marginBottom: '20px' }}>Hello from Roopik!</h1>
			<button
				style={{
					padding: '12px 24px',
					background: '#007acc',
					color: 'white',
					border: 'none',
					borderRadius: '4px',
					fontSize: '16px',
					cursor: 'pointer',
					fontWeight: '500'
				}}
				onClick={() => alert('Button clicked!')}
			>
				Click Me
			</button>
		</div>
	);
}`,
		dependencies: { 'react': '18.2.0', 'react-dom': '18.2.0' }
	},

	'LEGACY_INTERACTIVE_COUNTER': {
		id: 'counter_sample_002',
		name: 'Interactive Counter',
		code: `import React, { useState } from 'react';

export default function Component() {
	const [count, setCount] = useState(0);

	return (
		<div style={{
			padding: '40px',
			textAlign: 'center',
			fontFamily: 'system-ui, sans-serif',
			background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
			minHeight: '300px',
			display: 'flex',
			flexDirection: 'column',
			justifyContent: 'center',
			borderRadius: '12px'
		}}>
			<h2 style={{ color: 'white', marginBottom: '20px', fontSize: '28px' }}>Counter</h2>
			<div style={{
				fontSize: '72px',
				fontWeight: 'bold',
				color: 'white',
				marginBottom: '30px'
			}}>
				{count}
			</div>
			<div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
				<button
					onClick={() => setCount(count - 1)}
					style={{
						padding: '12px 24px',
						background: 'rgba(255,255,255,0.2)',
						color: 'white',
						border: '2px solid white',
						borderRadius: '8px',
						fontSize: '16px',
						cursor: 'pointer',
						fontWeight: '600'
					}}
				>
					−
				</button>
				<button
					onClick={() => setCount(0)}
					style={{
						padding: '12px 24px',
						background: 'rgba(255,255,255,0.2)',
						color: 'white',
						border: '2px solid white',
						borderRadius: '8px',
						fontSize: '16px',
						cursor: 'pointer',
						fontWeight: '600'
					}}
				>
					Reset
				</button>
				<button
					onClick={() => setCount(count + 1)}
					style={{
						padding: '12px 24px',
						background: 'rgba(255,255,255,0.2)',
						color: 'white',
						border: '2px solid white',
						borderRadius: '8px',
						fontSize: '16px',
						cursor: 'pointer',
						fontWeight: '600'
					}}
				>
					+
				</button>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18.2.0', 'react-dom': '18.2.0' }
	},

	'LEGACY_STYLED_CARD': {
		id: 'card_sample_003',
		name: 'Styled Card',
		code: `import React from 'react';

export default function Component() {
	return (
		<div style={{
			padding: '40px',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
			minHeight: '400px',
			background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
		}}>
			<div style={{
				background: 'white',
				borderRadius: '16px',
				padding: '40px',
				maxWidth: '400px',
				boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
				transform: 'translateY(0)',
				transition: 'transform 0.3s ease'
			}}>
				<div style={{
					width: '60px',
					height: '60px',
					background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
					borderRadius: '12px',
					marginBottom: '20px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: '32px'
				}}>
					🎨
				</div>
				<h2 style={{
					margin: '0 0 10px 0',
					color: '#333',
					fontSize: '28px',
					fontWeight: '700'
				}}>
					Beautiful Card
				</h2>
				<p style={{
					color: '#666',
					lineHeight: '1.6',
					margin: '0 0 24px 0',
					fontSize: '16px'
				}}>
					This is a styled card component rendered in the Mode 1 sandbox.
					It demonstrates that CSS styling and React components work perfectly!
				</p>
				<button style={{
					width: '100%',
					padding: '14px',
					background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
					color: 'white',
					border: 'none',
					borderRadius: '8px',
					fontSize: '16px',
					fontWeight: '600',
					cursor: 'pointer'
				}}>
					Learn More
				</button>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18.2.0', 'react-dom': '18.2.0' }
	},

	'LEGACY_LOGIN_SPLIT': {
		id: 'login_split_004',
		name: 'Login - Split Screen',
		code: `import React, { useState } from 'react';

export default function Component() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [isHovered, setIsHovered] = useState(false);

	const handleSubmit = (e) => {
		e.preventDefault();
		alert(\`Login attempt with: \${email}\`);
	};

	const inputStyle = {
		width: '100%',
		padding: '14px 16px',
		fontSize: '15px',
		border: '2px solid #e5e7eb',
		borderRadius: '8px',
		outline: 'none',
		transition: 'all 0.2s ease',
		fontFamily: 'inherit',
		boxSizing: 'border-box'
	};

	const buttonStyle = {
		width: '100%',
		padding: '14px',
		fontSize: '16px',
		fontWeight: '600',
		color: 'white',
		background: isHovered
			? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
			: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
		border: 'none',
		borderRadius: '8px',
		cursor: 'pointer',
		transition: 'all 0.3s ease',
		boxShadow: '0 4px 15px rgba(250, 112, 154, 0.4)'
	};

	return (
		<div style={{
			minHeight: '100vh',
			display: 'flex',
			background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
		}}>
			{/* Left side - Image/Brand */}
			<div style={{
				flex: '1',
				background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				alignItems: 'center',
				padding: '60px',
				color: 'white'
			}}>
				<div style={{ fontSize: '72px', marginBottom: '24px' }}>🚀</div>
				<h1 style={{ fontSize: '48px', margin: '0 0 16px 0', fontWeight: '800' }}>Roopik</h1>
				<p style={{ fontSize: '20px', opacity: 0.9, textAlign: 'center', maxWidth: '400px', lineHeight: '1.6' }}>
					Build beautiful UIs with AI-powered design tools
				</p>
			</div>

			{/* Right side - Login Form */}
			<div style={{
				flex: '1',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: '40px'
			}}>
				<div style={{
					background: 'white',
					padding: '48px',
					borderRadius: '24px',
					boxShadow: '0 20px 80px rgba(0, 0, 0, 0.12)',
					width: '100%',
					maxWidth: '440px'
				}}>
					<h2 style={{ fontSize: '32px', fontWeight: '700', color: '#1f2937', margin: '0 0 12px 0' }}>
						Welcome back
					</h2>
					<p style={{ color: '#6b7280', fontSize: '15px', marginBottom: '32px' }}>
						Enter your credentials to access your account
					</p>

					<form onSubmit={handleSubmit}>
						<div style={{ marginBottom: '20px' }}>
							<label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
								Email
							</label>
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="name@company.com"
								style={inputStyle}
								required
							/>
						</div>

						<div style={{ marginBottom: '28px' }}>
							<label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
								Password
							</label>
							<input
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								style={inputStyle}
								required
							/>
						</div>

						<button
							type="submit"
							style={buttonStyle}
							onMouseEnter={() => setIsHovered(true)}
							onMouseLeave={() => setIsHovered(false)}
						>
							Sign in
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18.2.0', 'react-dom': '18.2.0' }
	},

	'LEGACY_LOGIN_DARK': {
		id: 'login_dark_005',
		name: 'Login - Dark Glass',
		code: `import React, { useState } from 'react';

export default function Component() {
	const [email, setEmail] = useState('');
 	const [password, setPassword] = useState('');

	const handleSubmit = (e) => {
		e.preventDefault();
		alert(\`Login attempt with: \${email}\`);
	};

	return (
		<div style={{
			minHeight: '100vh',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			background: '#0a0e27',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			padding: '20px'
		}}>
			<div style={{
				background: 'rgba(255, 255, 255, 0.05)',
				backdropFilter: 'blur(10px)',
				border: '1px solid rgba(255, 255, 255, 0.1)',
				borderRadius: '20px',
				padding: '48px',
				width: '100%',
				maxWidth: '420px',
				boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
			}}>
				<div style={{
					width: '64px',
					height: '64px',
					background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
					borderRadius: '16px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: '32px',
					marginBottom: '32px',
					boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)'
				}}>
					🔐
				</div>

				<h1 style={{ fontSize: '28px', fontWeight: '700', color: 'white', margin: '0 0 8px 0' }}>
					Sign in
				</h1>
				<p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', marginBottom: '32px' }}>
					Access your account dashboard
				</p>

				<form onSubmit={handleSubmit}>
					<div style={{ marginBottom: '20px' }}>
						<label style={{
							display: 'block', fontSize: '13px', fontWeight: '500',
							color: 'rgba(255, 255, 255, 0.8)', marginBottom: '8px',
							textTransform: 'uppercase', letterSpacing: '0.5px'
						}}>
							Email Address
						</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@company.com"
							style={{
								width: '100%',
								padding: '14px',
								background: 'rgba(255, 255, 255, 0.05)',
								border: '1px solid rgba(255, 255, 255, 0.1)',
								borderRadius: '10px',
								color: 'white',
								fontSize: '15px',
								outline: 'none'
							}}
							required
						/>
					</div>

					<div style={{ marginBottom: '20px' }}>
						<label style={{
							display: 'block', fontSize: '13px', fontWeight: '500',
							color: 'rgba(255, 255, 255, 0.8)', marginBottom: '8px',
							textTransform: 'uppercase', letterSpacing: '0.5px'
						}}>
							Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							style={{
								width: '100%',
								padding: '14px',
								background: 'rgba(255, 255, 255, 0.05)',
								border: '1px solid rgba(255, 255, 255, 0.1)',
								borderRadius: '10px',
								color: 'white',
								fontSize: '15px',
								outline: 'none'
							}}
							required
						/>
					</div>

					<button
						type="submit"
						style={{
							width: '100%',
							padding: '14px',
							borderRadius: '10px',
							border: 'none',
							background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
							color: 'white',
							fontSize: '16px',
							fontWeight: '600',
							cursor: 'pointer',
							boxShadow: '0 10px 25px rgba(99, 102, 241, 0.4)'
						}}
					>
						Access Dashboard
					</button>
				</form>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18.2.0', 'react-dom': '18.2.0' }
	},

	'LEGACY_ONBOARDING_MODERN': {
		id: 'onboarding_modern_006',
		name: 'Onboarding - Modern',
		code: `import React, { useState } from 'react';

export default function Component() {
	const [currentStep, setCurrentStep] = useState(0);

	const steps = [
		{ icon: '🚀', title: 'Welcome to Roopik', description: 'Build beautiful user interfaces with AI-powered design tools.' },
		{ icon: '🎨', title: 'Drag & Drop Interface', description: 'Create stunning layouts by simply dragging components onto your canvas.' },
		{ icon: '⚡', title: 'Real-time Preview', description: 'See your changes instantly with our live preview feature.' }
	];

	const currentData = steps[currentStep];

	return (
		<div style={{
			minHeight: '100vh',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			justifyContent: 'center',
			background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			padding: '40px 20px'
		}}>
			<div style={{
				background: 'white',
				borderRadius: '24px',
				padding: '64px 48px',
				maxWidth: '500px',
				width: '100%',
				boxShadow: '0 20px 80px rgba(0, 0, 0, 0.2)',
				textAlign: 'center'
			}}>
				<div style={{ fontSize: '80px', marginBottom: '32px' }}>{currentData.icon}</div>

				<h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1f2937', margin: '0 0 16px 0' }}>
					{currentData.title}
				</h1>

				<p style={{ fontSize: '16px', color: '#6b7280', lineHeight: '1.6', marginBottom: '40px' }}>
					{currentData.description}
				</p>

				<div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
					{steps.map((_, index) => (
						<div
							key={index}
							style={{
								width: currentStep === index ? '32px' : '8px',
								height: '8px',
								borderRadius: '4px',
								background: currentStep === index
									? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
									: '#e5e7eb',
								transition: 'all 0.3s ease'
							}}
						/>
					))}
				</div>

				<div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
					{currentStep > 0 && (
						<button
							onClick={() => setCurrentStep(currentStep - 1)}
							style={{
								padding: '12px 32px', fontSize: '16px', fontWeight: '600',
								color: '#667eea', background: 'white',
								border: '2px solid #667eea', borderRadius: '12px', cursor: 'pointer'
							}}
						>
							Back
						</button>
					)}
					<button
						onClick={() => {
							if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1);
							else alert('Get started!');
						}}
						style={{
							padding: '12px 32px', fontSize: '16px', fontWeight: '600',
							color: 'white',
							background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
							border: 'none', borderRadius: '12px', cursor: 'pointer'
						}}
					>
						{currentStep < steps.length - 1 ? 'Next' : 'Get Started'}
					</button>
				</div>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18.2.0', 'react-dom': '18.2.0' }
	},

	'LEGACY_ONBOARDING_CARDS': {
		id: 'onboarding_cards_007',
		name: 'Onboarding - Cards',
		code: `import React, { useState } from 'react';

export default function Component() {
	const [selectedCard, setSelectedCard] = useState(null);

	const features = [
		{ icon: '💡', title: 'Smart Components', description: 'Access a library of pre-built, customizable components', color: '#f59e0b' },
		{ icon: '🎯', title: 'Pixel Perfect', description: 'Design with precision using our advanced grid system', color: '#10b981' },
		{ icon: '🔥', title: 'Hot Reload', description: 'See your changes instantly without refreshing', color: '#ef4444' }
	];

	return (
		<div style={{
			minHeight: '100vh',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			justifyContent: 'center',
			background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			padding: '40px 20px'
		}}>
			<div style={{ maxWidth: '1000px', width: '100%', textAlign: 'center' }}>
				<h1 style={{
					fontSize: '48px', fontWeight: '800', color: 'white', margin: '0 0 16px 0',
					background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
					WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
				}}>
					Welcome to Roopik
				</h1>

				<p style={{ fontSize: '18px', color: '#94a3b8', marginBottom: '64px', lineHeight: '1.6' }}>
					Choose a feature to learn more
				</p>

				<div style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
					gap: '24px',
					marginBottom: '48px'
				}}>
					{features.map((feature, index) => (
						<div
							key={index}
							onClick={() => setSelectedCard(selectedCard === index ? null : index)}
							style={{
								background: selectedCard === index ? 'rgba(102, 126, 234, 0.1)' : 'rgba(255, 255, 255, 0.05)',
								border: \`2px solid \${selectedCard === index ? feature.color : 'rgba(255, 255, 255, 0.1)'}\`,
								borderRadius: '16px', padding: '32px 24px', cursor: 'pointer',
								transition: 'all 0.3s ease',
								transform: selectedCard === index ? 'translateY(-8px)' : 'translateY(0)'
							}}
						>
							<div style={{ fontSize: '56px', marginBottom: '16px' }}>{feature.icon}</div>
							<h3 style={{ fontSize: '24px', fontWeight: '700', color: 'white', margin: '0 0 12px 0' }}>
								{feature.title}
							</h3>
							<p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.6', margin: 0 }}>
								{feature.description}
							</p>
						</div>
					))}
				</div>

				<button
					onClick={() => alert('Start building!')}
					style={{
						padding: '16px 48px', fontSize: '18px', fontWeight: '600', color: 'white',
						background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
						border: 'none', borderRadius: '12px', cursor: 'pointer'
					}}
				>
					Start Building
				</button>
			</div>
		</div>
	);
}`,
		dependencies: { 'react': '18.2.0', 'react-dom': '18.2.0' }
	},

	'LEGACY_ONBOARDING_SLIDER': {
		id: 'onboarding_slider_008',
		name: 'Onboarding - Slider',
		code: `import React, { useState } from 'react';

export default function Component() {
	const [activeSlide, setActiveSlide] = useState(0);

	const slides = [
		{ emoji: '👋', title: 'Hello, Designer!', description: 'Welcome to the future of UI design.', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
		{ emoji: '✨', title: 'AI-Powered Magic', description: 'Let AI help you design and generate components.', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
		{ emoji: '🎉', title: 'Ready to Create?', description: 'Start building amazing experiences with Roopik.', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }
	];

	return (
		<div style={{
			minHeight: '100vh',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			background: slides[activeSlide].gradient,
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			transition: 'background 0.5s ease',
			padding: '20px',
			position: 'relative'
		}}>
			{activeSlide > 0 && (
				<button
					onClick={() => setActiveSlide(activeSlide - 1)}
					style={{
						position: 'absolute', left: '40px', width: '56px', height: '56px',
						borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)',
						border: '2px solid rgba(255, 255, 255, 0.3)',
						color: 'white', fontSize: '24px', cursor: 'pointer'
					}}
				>
					←
				</button>
			)}

			<div style={{ maxWidth: '600px', width: '100%', textAlign: 'center', color: 'white' }}>
				<div style={{ fontSize: '120px', marginBottom: '32px' }}>{slides[activeSlide].emoji}</div>
				<h1 style={{ fontSize: '48px', fontWeight: '800', margin: '0 0 24px 0' }}>
					{slides[activeSlide].title}
				</h1>
				<p style={{ fontSize: '20px', lineHeight: '1.6', marginBottom: '48px', opacity: 0.9 }}>
					{slides[activeSlide].description}
				</p>

				<div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
					<button
						onClick={() => alert('Get started!')}
						style={{
							padding: '14px 32px',
							background: 'white',
							color: '#111827',
							border: 'none',
							borderRadius: '999px',
							fontSize: '16px',
							fontWeight: '600',
							cursor: 'pointer',
							boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)'
						}}
					>
						Get Started
					</button>
					<button
						onClick={() => setActiveSlide((activeSlide + 1) % slides.length)}
						style={{
							padding: '14px 32px',
							background: 'rgba(255, 255, 255, 0.2)',
							color: 'white',
							border: '2px solid rgba(255, 255, 255, 0.4)',
							borderRadius: '999px',
							fontSize: '16px',
							fontWeight: '600',
							cursor: 'pointer'
						}}
					>
						Next
					</button>
				</div>

				<div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
					{slides.map((_, index) => (
						<div
							key={index}
							style={{
								width: activeSlide === index ? '28px' : '8px',
								height: '8px',
								borderRadius: '999px',
								background: activeSlide === index ? 'white' : 'rgba(255, 255, 255, 0.3)',
								transition: 'all 0.3s ease'
							}}
						/>
					))}
				</div>
			</div>

			{activeSlide < slides.length - 1 && (
				<button
					onClick={() => setActiveSlide(activeSlide + 1)}
					style={{
						position: 'absolute', right: '40px', width: '56px', height: '56px',
						borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)',
						border: '2px solid rgba(255, 255, 255, 0.3)',
						color: 'white', fontSize: '24px', cursor: 'pointer'
					}}
				>
					→
				</button>
			)}
		</div>
	);
}`,
		dependencies: { 'react': '18.2.0', 'react-dom': '18.2.0' }
	},

	'LEGACY_ONBOARDING_SCROLL': {
		id: 'onboarding_scroll_009',
		name: 'Onboarding - Scroll Form',
		code: `import React, { useState } from 'react';

		export default function Component() {
			const [formData, setFormData] = useState({
				fullName: '',
				email: '',
				company: '',
				role: '',
				experience: '',
				interests: [],
				goals: '',
				budget: '',
				timeline: '',
				preferences: '',
				additionalInfo: ''
			});

			const handleChange = (field, value) => {
				setFormData(prev => ({ ...prev, [field]: value }));
			};

			const handleInterestToggle = (interest) => {
				setFormData(prev => ({
					...prev,
					interests: prev.interests.includes(interest)
						? prev.interests.filter(i => i !== interest)
						: [...prev.interests, interest]
				}));
			};

			const handleSubmit = (e) => {
				e.preventDefault();
				alert(\`Thank you! We'll be in touch soon.\`);
			};

			const inputStyle = {
				width: '100%',
				padding: '14px 16px',
				fontSize: '15px',
				border: '2px solid #e5e7eb',
				borderRadius: '10px',
				outline: 'none',
				transition: 'all 0.2s ease',
				fontFamily: 'inherit',
				boxSizing: 'border-box',
				background: 'white'
			};

			const sectionStyle = {
				background: 'white',
				borderRadius: '16px',
				padding: '40px',
				marginBottom: '32px',
				boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
			};

			return (
				<div style={{
					minHeight: '100vh',
					background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
					padding: '60px 20px'
				}}>
					<div style={{ maxWidth: '800px', margin: '0 auto' }}>
						{/* Header */}
						<div style={{ textAlign: 'center', marginBottom: '48px', color: 'white' }}>
							<div style={{ fontSize: '64px', marginBottom: '16px' }}>🚀</div>
							<h1 style={{ fontSize: '42px', fontWeight: '800', margin: '0 0 12px 0' }}>
								Welcome to Roopik
							</h1>
							<p style={{ fontSize: '18px', opacity: 0.9, lineHeight: '1.6' }}>
								Let's get you set up! Please fill out the details below to get started.
							</p>
						</div>

						<form onSubmit={handleSubmit}>
							{/* Personal Information */}
							<div style={sectionStyle}>
								<h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
									<span>👤</span> Personal Information
								</h2>
								<p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
									Tell us a bit about yourself
								</p>

								<div style={{ marginBottom: '20px' }}>
									<label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
										Full Name *
									</label>
									<input
										type="text"
										value={formData.fullName}
										onChange={(e) => handleChange('fullName', e.target.value)}
										placeholder="John Doe"
										style={inputStyle}
										required
									/>
								</div>

								<div style={{ marginBottom: '20px' }}>
									<label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
										Email Address *
									</label>
									<input
										type="email"
										value={formData.email}
										onChange={(e) => handleChange('email', e.target.value)}
										placeholder="john@company.com"
										style={inputStyle}
										required
									/>
								</div>

								<div>
									<label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
										Company Name
									</label>
									<input
										type="text"
										value={formData.company}
										onChange={(e) => handleChange('company', e.target.value)}
										placeholder="Acme Inc."
										style={inputStyle}
									/>
								</div>
							</div>

							{/* Professional Details */}
							<div style={sectionStyle}>
								<h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
									<span>💼</span> Professional Details
								</h2>
								<p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
									Help us understand your role and experience
								</p>

								<div style={{ marginBottom: '20px' }}>
									<label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
										Your Role *
									</label>
									<select
										value={formData.role}
										onChange={(e) => handleChange('role', e.target.value)}
										style={{ ...inputStyle, cursor: 'pointer' }}
										required
									>
										<option value="">Select your role</option>
										<option value="designer">UI/UX Designer</option>
										<option value="developer">Frontend Developer</option>
										<option value="product">Product Manager</option>
										<option value="founder">Founder/Entrepreneur</option>
										<option value="other">Other</option>
									</select>
								</div>

								<div>
									<label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
										Years of Experience
									</label>
									<select
										value={formData.experience}
										onChange={(e) => handleChange('experience', e.target.value)}
										style={{ ...inputStyle, cursor: 'pointer' }}
									>
										<option value="">Select experience level</option>
										<option value="0-1">0-1 years</option>
										<option value="2-5">2-5 years</option>
										<option value="6-10">6-10 years</option>
										<option value="10+">10+ years</option>
									</select>
								</div>
							</div>

							{/* Interests */}
							<div style={sectionStyle}>
								<h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
									<span>🎯</span> What Interests You?
								</h2>
								<p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
									Select all that apply (scroll to see more options)
								</p>

								<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
									{['Component Design', 'Prototyping', 'Code Generation', 'Design Systems', 'Animation', 'Responsive Design', 'Accessibility', 'Performance'].map(interest => (
										<button
											key={interest}
											type="button"
											onClick={() => handleInterestToggle(interest)}
											style={{
												padding: '12px 16px',
												fontSize: '14px',
												fontWeight: '500',
												border: \`2px solid \${formData.interests.includes(interest) ? '#667eea' : '#e5e7eb'}\`,
												borderRadius: '8px',
												background: formData.interests.includes(interest) ? '#667eea' : 'white',
												color: formData.interests.includes(interest) ? 'white' : '#374151',
												cursor: 'pointer',
												transition: 'all 0.2s ease'
											}}
										>
											{interest}
										</button>
									))}
								</div>
							</div>

							{/* Goals */}
							<div style={sectionStyle}>
								<h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
									<span>🎨</span> Your Goals
								</h2>
								<p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
									What do you hope to achieve with Roopik?
								</p>

								<textarea
									value={formData.goals}
									onChange={(e) => handleChange('goals', e.target.value)}
									placeholder="E.g., Build a design system for my startup, create reusable components, speed up my design workflow..."
									style={{
										...inputStyle,
										minHeight: '120px',
										resize: 'vertical',
										fontFamily: 'inherit'
									}}
								/>
							</div>

							{/* Project Details */}
							<div style={sectionStyle}>
								<h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
									<span>📋</span> Project Details
								</h2>
								<p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
									Help us understand your project needs
								</p>

								<div style={{ marginBottom: '20px' }}>
									<label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
										Budget Range
									</label>
									<select
										value={formData.budget}
										onChange={(e) => handleChange('budget', e.target.value)}
										style={{ ...inputStyle, cursor: 'pointer' }}
									>
										<option value="">Select budget range</option>
										<option value="free">Free tier</option>
										<option value="1-50">$1 - $50/month</option>
										<option value="50-200">$50 - $200/month</option>
										<option value="200+">$200+/month</option>
									</select>
								</div>

								<div style={{ marginBottom: '20px' }}>
									<label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
										Timeline
									</label>
									<select
										value={formData.timeline}
										onChange={(e) => handleChange('timeline', e.target.value)}
										style={{ ...inputStyle, cursor: 'pointer' }}
									>
										<option value="">Select timeline</option>
										<option value="immediate">Starting immediately</option>
										<option value="1month">Within 1 month</option>
										<option value="3months">Within 3 months</option>
										<option value="6months">Within 6 months</option>
										<option value="exploring">Just exploring</option>
									</select>
								</div>

								<div>
									<label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
										Design Preferences
									</label>
									<textarea
										value={formData.preferences}
										onChange={(e) => handleChange('preferences', e.target.value)}
										placeholder="Any specific design styles, frameworks, or tools you prefer?"
										style={{
											...inputStyle,
											minHeight: '100px',
											resize: 'vertical',
											fontFamily: 'inherit'
										}}
									/>
								</div>
							</div>

							{/* Additional Information */}
							<div style={sectionStyle}>
								<h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
									<span>💬</span> Additional Information
								</h2>
								<p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
									Anything else you'd like us to know?
								</p>

								<textarea
									value={formData.additionalInfo}
									onChange={(e) => handleChange('additionalInfo', e.target.value)}
									placeholder="Questions, comments, or special requirements..."
									style={{
										...inputStyle,
										minHeight: '120px',
										resize: 'vertical',
										fontFamily: 'inherit'
									}}
								/>
							</div>

							{/* Submit Button */}
							<div style={{ textAlign: 'center', marginTop: '48px', marginBottom: '32px' }}>
								<button
									type="submit"
									style={{
										padding: '16px 48px',
										fontSize: '18px',
										fontWeight: '700',
										color: 'white',
										background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
										border: 'none',
										borderRadius: '50px',
										cursor: 'pointer',
										boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
										transition: 'transform 0.2s ease'
									}}
									onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
									onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
								>
									Submit & Get Started
								</button>
								<p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px', marginTop: '16px' }}>
									By submitting, you agree to our terms and privacy policy
								</p>
							</div>
						</form>
					</div>
				</div>
			);
		}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},
	'REACT_HEADER': {
		id: 'react_header_new',
		name: '🚀 React Header (ESBuild)',
		code: `
		import React, { useState } from 'react';

		export default function Component() {
			const [activeNav, setActiveNav] = useState('Home');

			const navItems = ['Home', 'Products', 'Solutions', 'Pricing'];

			return (
				<header style={{
					width: '100%',
					minWidth: '320px',
					background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
					boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
				}}>
					{/* Top bar - responsive text */}
					<div style={{
						background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
						padding: '8px 16px',
						textAlign: 'center'
					}}>
						<span style={{ color: 'white', fontSize: 'clamp(11px, 2.5vw, 13px)', fontWeight: '500' }}>
							🎉 New: AI-powered design tools! <a href="#" style={{ color: '#fff', textDecoration: 'underline', marginLeft: '4px' }}>Learn more →</a>
						</span>
					</div>

					{/* Main header - flexible layout */}
					<div style={{
						width: '100%',
						padding: '0 clamp(12px, 3vw, 40px)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						flexWrap: 'wrap',
						gap: '12px',
						minHeight: '60px',
						boxSizing: 'border-box'
					}}>
						{/* Logo - always visible */}
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
							<div style={{
								width: 'clamp(32px, 8vw, 44px)',
								height: 'clamp(32px, 8vw, 44px)',
								background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
								borderRadius: '10px',
								display: 'flex', alignItems: 'center', justifyContent: 'center',
								fontSize: 'clamp(16px, 4vw, 24px)'
							}}>
								🚀
							</div>
							<span style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '700', color: 'white', letterSpacing: '-0.5px' }}>
								Roopik
							</span>
						</div>

						{/* Navigation - responsive, wraps on small screens */}
						<nav style={{
							display: 'flex',
							alignItems: 'center',
							gap: '4px',
							flexWrap: 'wrap',
							flex: '1 1 auto',
							justifyContent: 'center',
							minWidth: '0'
						}}>
							{navItems.map((item) => (
								<button
									key={item}
									onClick={() => setActiveNav(item)}
									style={{
										padding: 'clamp(6px, 1.5vw, 10px) clamp(10px, 2vw, 18px)',
										background: activeNav === item ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
										border: 'none',
										borderRadius: '8px',
										color: activeNav === item ? '#a5b4fc' : 'rgba(255, 255, 255, 0.7)',
										fontSize: 'clamp(12px, 2.5vw, 14px)',
										fontWeight: '500',
										cursor: 'pointer',
										transition: 'all 0.2s ease',
										whiteSpace: 'nowrap'
									}}
								>
									{item}
								</button>
							))}
						</nav>

						{/* Actions - responsive sizing */}
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
							<button style={{
								padding: 'clamp(6px, 1.5vw, 10px) clamp(12px, 2.5vw, 20px)',
								background: 'transparent',
								border: '1px solid rgba(255, 255, 255, 0.2)',
								borderRadius: '8px',
								color: 'white',
								fontSize: 'clamp(12px, 2.5vw, 14px)',
								fontWeight: '500',
								cursor: 'pointer',
								whiteSpace: 'nowrap'
							}}>
								Sign In
							</button>
							<button style={{
								padding: 'clamp(6px, 1.5vw, 10px) clamp(12px, 2.5vw, 20px)',
								background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
								border: 'none',
								borderRadius: '8px',
								color: 'white',
								fontSize: 'clamp(12px, 2.5vw, 14px)',
								fontWeight: '600',
								cursor: 'pointer',
								boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
								whiteSpace: 'nowrap'
							}}>
								Get Started
							</button>
						</div>
					</div>
				</header>
			);
		}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},

	'REACT_FOOTER': {
		id: 'react_footer_new',
		name: '🚀 React Footer (ESBuild)',
		code: `import React from 'react';

export default function Component() {
    const footerLinks = {
        Product: ['Features', 'Pricing', 'Docs'],
        Company: ['About', 'Blog', 'Careers'],
        Legal: ['Privacy', 'Terms']
    };

    const socialLinks = [
        { name: 'Twitter', icon: '𝕏' },
        { name: 'GitHub', icon: '⚡' },
        { name: 'Discord', icon: '💬' }
    ];

    return (
        <footer style={{
            width: '100%',
            minWidth: '280px',
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: 'white',
            padding: 'clamp(24px, 6vw, 60px) clamp(16px, 4vw, 40px)'
        }}>
            {/* Main footer content - responsive grid */}
            <div style={{
                width: '100%',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'clamp(24px, 4vw, 48px)',
                marginBottom: 'clamp(24px, 4vw, 40px)'
            }}>
                {/* Brand section */}
                <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <div style={{
                            width: 'clamp(36px, 8vw, 48px)',
                            height: 'clamp(36px, 8vw, 48px)',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            borderRadius: '12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 'clamp(20px, 4vw, 28px)'
                        }}>
                            🚀
                        </div>
                        <span style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: '700', letterSpacing: '-0.5px' }}>
                            Roopik
                        </span>
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: 'clamp(13px, 2.5vw, 15px)', lineHeight: '1.6', marginBottom: '16px' }}>
                        Build beautiful UIs with AI-powered design tools.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {socialLinks.map((social) => (
                            <button
                                key={social.name}
                                style={{
                                    width: 'clamp(36px, 8vw, 44px)',
                                    height: 'clamp(36px, 8vw, 44px)',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '10px',
                                    color: '#94a3b8',
                                    fontSize: 'clamp(14px, 3vw, 18px)',
                                    cursor: 'pointer'
                                }}
                                title={social.name}
                            >
                                {social.icon}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Link columns - responsive */}
                {Object.entries(footerLinks).map(([title, links]) => (
                    <div key={title} style={{ flex: '0 1 auto', minWidth: '100px' }}>
                        <h4 style={{
                            fontSize: 'clamp(12px, 2.5vw, 14px)',
                            fontWeight: '600',
                            color: 'white',
                            marginBottom: '12px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            {title}
                        </h4>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {links.map((link) => (
                                <li key={link} style={{ marginBottom: '8px' }}>
                                    <a href="#" style={{
                                        color: '#94a3b8',
                                        textDecoration: 'none',
                                        fontSize: 'clamp(12px, 2.5vw, 14px)'
                                    }}>
                                        {link}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {/* Bottom bar - responsive */}
            <div style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                paddingTop: '16px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
            }}>
                <span style={{ color: '#64748b', fontSize: 'clamp(11px, 2.5vw, 14px)' }}>
                    © 2024 Roopik Labs
                </span>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#64748b', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>🌍 EN</span>
                    <span style={{ color: '#64748b', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>🌙 Dark</span>
                </div>
            </div>
        </footer>
    );
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},
	'REACT_DASHBOARD': {
		id: 'react_dashboard_new',
		name: '🚀 React Dashboard (ESBuild)',
		code: `
import React, { useState } from 'react';

export default function Component() {
    const [selectedPeriod, setSelectedPeriod] = useState('7d');

    const stats = [
        { label: 'Revenue', value: '$45.2K', change: '+20%', positive: true, icon: '💰' },
        { label: 'Users', value: '2,350', change: '+180', positive: true, icon: '👥' }
    ];

    const orders = [
        { id: '#3210', customer: 'Olivia M.', amount: '$316', status: 'Done' },
        { id: '#3209', customer: 'Jackson L.', amount: '$242', status: 'Pending' }
    ];

    return (
        <div style={{
            minHeight: '100vh',
            width: '100%',
            minWidth: '280px',
            background: '#0f172a',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: 'clamp(16px, 4vw, 32px)',
            color: 'white',
            boxSizing: 'border-box'
        }}>
            {/* Header - responsive */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginBottom: 'clamp(16px, 4vw, 32px)'
            }}>
                <div>
                    <h1 style={{ fontSize: 'clamp(20px, 5vw, 32px)', fontWeight: '700', margin: '0 0 4px 0' }}>Dashboard</h1>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: 'clamp(12px, 2.5vw, 15px)' }}>Welcome back!</p>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {['24h', '7d', '30d'].map((period) => (
                        <button
                            key={period}
                            onClick={() => setSelectedPeriod(period)}
                            style={{
                                padding: 'clamp(4px, 1vw, 8px) clamp(8px, 2vw, 16px)',
                                background: selectedPeriod === period ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255, 255, 255, 0.05)',
                                border: selectedPeriod === period ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: 'clamp(11px, 2.5vw, 13px)',
                                fontWeight: '500',
                                cursor: 'pointer'
                            }}
                        >
                            {period}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Grid - responsive with auto-fit */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 'clamp(12px, 2vw, 20px)',
                marginBottom: 'clamp(16px, 4vw, 32px)'
            }}>
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '12px',
                            padding: 'clamp(12px, 3vw, 24px)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <span style={{ color: '#94a3b8', fontSize: 'clamp(11px, 2.5vw, 14px)', fontWeight: '500' }}>{stat.label}</span>
                            <span style={{ fontSize: 'clamp(16px, 4vw, 24px)' }}>{stat.icon}</span>
                        </div>
                        <div style={{ fontSize: 'clamp(20px, 5vw, 32px)', fontWeight: '700', marginBottom: '4px' }}>{stat.value}</div>
                        <span style={{
                            color: stat.positive ? '#22c55e' : '#ef4444',
                            fontSize: 'clamp(11px, 2.5vw, 13px)',
                            fontWeight: '500'
                        }}>
                            {stat.positive ? '↑' : '↓'} {stat.change}
                        </span>
                    </div>
                ))}
            </div>

            {/* Chart Area - responsive height */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '12px',
                padding: 'clamp(16px, 3vw, 24px)',
                marginBottom: 'clamp(16px, 4vw, 32px)',
                minHeight: 'clamp(120px, 30vw, 200px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 'clamp(32px, 10vw, 64px)', marginBottom: '8px' }}>📈</div>
                    <p style={{ color: '#64748b', fontSize: 'clamp(11px, 2.5vw, 14px)' }}>Revenue Chart</p>
                </div>
            </div>

            {/* Recent Orders - responsive list instead of table for small screens */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '12px',
                overflow: 'hidden'
            }}>
                <div style={{ padding: 'clamp(12px, 3vw, 20px)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <h3 style={{ margin: 0, fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: '600' }}>Recent Orders</h3>
                </div>
                <div style={{ padding: 'clamp(8px, 2vw, 16px)' }}>
                    {orders.map((order) => (
                        <div
                            key={order.id}
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '8px',
                                padding: 'clamp(8px, 2vw, 12px)',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 auto', minWidth: '100px' }}>
                                <span style={{ fontSize: 'clamp(11px, 2.5vw, 13px)', color: '#94a3b8' }}>{order.id}</span>
                                <span style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: '500' }}>{order.customer}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: '600' }}>{order.amount}</span>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: 'clamp(10px, 2vw, 12px)',
                                    fontWeight: '500',
                                    background: order.status === 'Done' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                                    color: order.status === 'Done' ? '#22c55e' : '#fbbf24'
                                }}>
                                    {order.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},
	'REACT_PRODUCT_CARD': {
		id: 'react_product_card_new',
		name: '🚀 React Product Card (ESBuild)',
		code: `
import React, { useState } from 'react';

export default function Component() {
    const [selectedSize, setSelectedSize] = useState('M');
    const [quantity, setQuantity] = useState(1);
    const [isFavorite, setIsFavorite] = useState(false);

    const sizes = ['S', 'M', 'L', 'XL'];
    const colors = ['#1e40af', '#dc2626', '#16a34a'];

    return (
        <div style={{
            minHeight: '100vh',
            width: '100%',
            minWidth: '280px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: 'clamp(16px, 4vw, 40px)',
            boxSizing: 'border-box'
        }}>
            <div style={{
                background: 'white',
                borderRadius: 'clamp(12px, 3vw, 24px)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
                overflow: 'hidden',
                width: '100%'
            }}>
                {/* Product Image - stacks on mobile */}
                <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 'clamp(150px, 40vw, 300px)',
                    position: 'relative'
                }}>
                    <div style={{ fontSize: 'clamp(60px, 20vw, 120px)' }}>👕</div>
                    <button
                        onClick={() => setIsFavorite(!isFavorite)}
                        style={{
                            position: 'absolute',
                            top: 'clamp(12px, 3vw, 24px)',
                            right: 'clamp(12px, 3vw, 24px)',
                            width: 'clamp(32px, 8vw, 48px)',
                            height: 'clamp(32px, 8vw, 48px)',
                            borderRadius: '50%',
                            background: 'white',
                            border: 'none',
                            fontSize: 'clamp(16px, 4vw, 24px)',
                            cursor: 'pointer'
                        }}
                    >
                        {isFavorite ? '❤️' : '🤍'}
                    </button>
                    <span style={{
                        position: 'absolute',
                        top: 'clamp(12px, 3vw, 24px)',
                        left: 'clamp(12px, 3vw, 24px)',
                        background: '#ef4444',
                        color: 'white',
                        padding: 'clamp(4px, 1vw, 8px) clamp(8px, 2vw, 16px)',
                        borderRadius: '6px',
                        fontSize: 'clamp(10px, 2.5vw, 13px)',
                        fontWeight: '600'
                    }}>
                        -30% OFF
                    </span>
                </div>

                {/* Product Details */}
                <div style={{ padding: 'clamp(16px, 4vw, 32px)' }}>
                    <h1 style={{ fontSize: 'clamp(18px, 4vw, 28px)', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0' }}>
                        Premium T-Shirt
                    </h1>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#fbbf24', fontSize: 'clamp(14px, 3vw, 18px)' }}>★★★★☆</span>
                        <span style={{ color: '#6b7280', fontSize: 'clamp(11px, 2.5vw, 14px)' }}>(128 reviews)</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'clamp(24px, 6vw, 36px)', fontWeight: '700', color: '#1f2937' }}>$49.99</span>
                        <span style={{ fontSize: 'clamp(14px, 3vw, 18px)', color: '#9ca3af', textDecoration: 'line-through' }}>$69.99</span>
                    </div>

                    {/* Colors */}
                    <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Color</h4>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {colors.map((color) => (
                                <button
                                    key={color}
                                    style={{
                                        width: 'clamp(28px, 7vw, 36px)',
                                        height: 'clamp(28px, 7vw, 36px)',
                                        borderRadius: '50%',
                                        background: color,
                                        border: '2px solid white',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                        cursor: 'pointer'
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Sizes */}
                    <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Size</h4>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {sizes.map((size) => (
                                <button
                                    key={size}
                                    onClick={() => setSelectedSize(size)}
                                    style={{
                                        padding: 'clamp(6px, 1.5vw, 10px) clamp(10px, 2.5vw, 16px)',
                                        borderRadius: '8px',
                                        background: selectedSize === size ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                                        border: selectedSize === size ? 'none' : '1px solid #e5e7eb',
                                        color: selectedSize === size ? 'white' : '#374151',
                                        fontSize: 'clamp(12px, 2.5vw, 14px)',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Quantity + Add to Cart */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                style={{
                                    width: 'clamp(32px, 8vw, 40px)',
                                    height: 'clamp(32px, 8vw, 40px)',
                                    borderRadius: '8px',
                                    background: '#f3f4f6',
                                    border: 'none',
                                    fontSize: 'clamp(16px, 4vw, 20px)',
                                    cursor: 'pointer'
                                }}
                            >−</button>
                            <span style={{ width: '40px', textAlign: 'center', fontSize: 'clamp(14px, 3vw, 16px)', fontWeight: '600' }}>{quantity}</span>
                            <button
                                onClick={() => setQuantity(quantity + 1)}
                                style={{
                                    width: 'clamp(32px, 8vw, 40px)',
                                    height: 'clamp(32px, 8vw, 40px)',
                                    borderRadius: '8px',
                                    background: '#f3f4f6',
                                    border: 'none',
                                    fontSize: 'clamp(16px, 4vw, 20px)',
                                    cursor: 'pointer'
                                }}
                            >+</button>
                        </div>
                        <button
                            onClick={() => alert('Added to cart!')}
                            style={{
                                flex: '1',
                                minWidth: '120px',
                                padding: 'clamp(10px, 2.5vw, 14px)',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                border: 'none',
                                borderRadius: '10px',
                                color: 'white',
                                fontSize: 'clamp(13px, 3vw, 16px)',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Add to Cart
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},
	'SAMPLE_RESPONSIVE_LAYOUT': {
		id: 'sample_responsive_layout_new',
		name: '🚀 Sample Responsive Layout (ESBuild)',
		code: `
import React, { useState, useEffect } from 'react';

/**
 * Responsive Layout Test Component
 * Tests device emulator by showing different layouts at different viewport widths:
 * - Desktop (1280px+): Full sidebar visible
 * - Tablet (768-1279px): Sidebar becomes collapsible section
 * - Mobile (<768px): Text buttons become icon-only
 */
export default function Component() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });

    useEffect(() => {
        const handleResize = () => {
            setViewport({ width: window.innerWidth, height: window.innerHeight });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isDesktop = viewport.width >= 1280;
    const isTablet = viewport.width >= 768 && viewport.width < 1280;
    const isMobile = viewport.width < 768;

    const menuItems = [
        { icon: '🏠', label: 'Dashboard', active: true },
        { icon: '📊', label: 'Analytics', active: false },
        { icon: '📁', label: 'Projects', active: false },
        { icon: '👥', label: 'Team', active: false },
        { icon: '⚙️', label: 'Settings', active: false }
    ];

    const actions = [
        { icon: '➕', label: 'New Project' },
        { icon: '📤', label: 'Export' },
        { icon: '🔍', label: 'Search' }
    ];

    // Get current mode label
    const modeLabel = isDesktop ? 'Desktop' : isTablet ? 'Tablet' : 'Mobile';
    const modeColor = isDesktop ? '#22c55e' : isTablet ? '#f59e0b' : '#ef4444';

    return (
        <div style={{
            minHeight: '100vh',
            width: '100%',
            background: '#0f172a',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Mode Indicator Badge */}
            <div style={{
                position: 'fixed',
                top: '16px',
                right: '16px',
                background: modeColor,
                color: 'white',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
                {modeLabel}: {viewport.width}×{viewport.height}px
            </div>

            {/* Main Layout */}
            <div style={{ display: 'flex', flex: 1 }}>

                {/* SIDEBAR - Desktop: Always visible, Tablet: Collapsible panel, Mobile: Hidden */}
                {isDesktop && (
                    <aside style={{
                        width: '260px',
                        background: '#1e293b',
                        borderRight: '1px solid rgba(255,255,255,0.1)',
                        padding: '24px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px',
                            marginBottom: '24px'
                        }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '20px'
                            }}>🚀</div>
                            <span style={{ color: 'white', fontSize: '20px', fontWeight: '700' }}>Roopik</span>
                        </div>

                        {menuItems.map((item, idx) => (
                            <button
                                key={idx}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px 16px',
                                    background: item.active ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '10px',
                                    color: item.active ? '#a5b4fc' : '#94a3b8',
                                    fontSize: '15px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    width: '100%'
                                }}
                            >
                                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                                {item.label}
                            </button>
                        ))}
                    </aside>
                )}

                {/* MAIN CONTENT */}
                <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

                    {/* Header */}
                    <header style={{
                        background: '#1e293b',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        padding: isMobile ? '12px 16px' : '16px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}>
                        {/* Tablet: Hamburger menu */}
                        {isTablet && (
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    color: 'white',
                                    fontSize: '20px',
                                    cursor: 'pointer'
                                }}
                            >
                                ☰
                            </button>
                        )}

                        {/* Mobile: Just logo */}
                        {isMobile && (
                            <div style={{
                                width: '36px',
                                height: '36px',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px'
                            }}>🚀</div>
                        )}

                        <h1 style={{
                            color: 'white',
                            fontSize: isMobile ? '18px' : '24px',
                            fontWeight: '700',
                            margin: 0,
                            flex: 1
                        }}>
                            Dashboard
                        </h1>

                        {/* Action Buttons - Desktop: Full text, Tablet: Text, Mobile: Icons only */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {actions.map((action, idx) => (
                                <button
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        padding: isMobile ? '8px' : '10px 16px',
                                        background: idx === 0
                                            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                            : 'rgba(255,255,255,0.05)',
                                        border: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        color: 'white',
                                        fontSize: isMobile ? '16px' : '14px',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        minWidth: isMobile ? '40px' : 'auto'
                                    }}
                                    title={action.label}
                                >
                                    <span>{action.icon}</span>
                                    {!isMobile && action.label}
                                </button>
                            ))}
                        </div>
                    </header>

                    {/* Tablet: Collapsible Sidebar Panel */}
                    {isTablet && sidebarOpen && (
                        <div style={{
                            background: '#1e293b',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            padding: '16px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px'
                        }}>
                            {menuItems.map((item, idx) => (
                                <button
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 16px',
                                        background: item.active ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.05)',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: item.active ? '#a5b4fc' : '#94a3b8',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span>{item.icon}</span>
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Content Area */}
                    <div style={{
                        flex: 1,
                        padding: isMobile ? '16px' : '24px',
                        overflowY: 'auto'
                    }}>
                        {/* Stats Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile
                                ? '1fr'
                                : isTablet
                                    ? 'repeat(2, 1fr)'
                                    : 'repeat(4, 1fr)',
                            gap: '16px',
                            marginBottom: '24px'
                        }}>
                            {[
                                { icon: '💰', label: 'Revenue', value: '$45.2K', change: '+20%' },
                                { icon: '👥', label: 'Users', value: '2,350', change: '+180' },
                                { icon: '📦', label: 'Orders', value: '1,247', change: '+15%' },
                                { icon: '⭐', label: 'Rating', value: '4.8', change: '+0.2' }
                            ].map((stat, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: '12px',
                                        padding: '20px'
                                    }}
                                >
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        marginBottom: '12px'
                                    }}>
                                        <span style={{ color: '#94a3b8', fontSize: '14px' }}>{stat.label}</span>
                                        <span style={{ fontSize: '24px' }}>{stat.icon}</span>
                                    </div>
                                    <div style={{
                                        fontSize: '28px',
                                        fontWeight: '700',
                                        color: 'white',
                                        marginBottom: '4px'
                                    }}>{stat.value}</div>
                                    <span style={{ color: '#22c55e', fontSize: '13px', fontWeight: '500' }}>
                                        ↑ {stat.change}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Info Box explaining current mode */}
                        <div style={{
                            background: 'rgba(102, 126, 234, 0.1)',
                            border: '1px solid rgba(102, 126, 234, 0.3)',
                            borderRadius: '12px',
                            padding: '20px'
                        }}>
                            <h3 style={{ color: '#a5b4fc', margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
                                📱 Current Mode: {modeLabel}
                            </h3>
                            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                                {isDesktop && 'Desktop layout: Full sidebar is visible on the left. All buttons show icons + text labels. Stats grid shows 4 columns.'}
                                {isTablet && 'Tablet layout: Sidebar is hidden behind hamburger menu (☰). Click it to expand the navigation as a horizontal panel. Stats grid shows 2 columns.'}
                                {isMobile && 'Mobile layout: Navigation is hidden. Action buttons show icons only (no text). Stats grid shows 1 column. Optimized for touch.'}
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},
	'SAMPLE_PRICING_TABLE': {
		id: 'sample_pricing_table_new',
		name: '🚀 Sample Pricing Table (ESBuild)',
		code: `
import React, { useState } from 'react';

export default function Component() {
    const [isAnnual, setIsAnnual] = useState(true);

    const plans = [
        {
            name: 'Starter',
            description: 'Perfect for individuals',
            monthlyPrice: 9,
            annualPrice: 7,
            features: ['5 Projects', '10GB Storage', 'Basic Analytics', 'Email Support'],
            cta: 'Start Free Trial',
            highlighted: false
        },
        {
            name: 'Professional',
            description: 'Best for growing teams',
            monthlyPrice: 29,
            annualPrice: 24,
            features: ['Unlimited Projects', '100GB Storage', 'Advanced Analytics', 'Priority Support', 'Custom Integrations', 'Team Collaboration'],
            cta: 'Get Started',
            highlighted: true
        },
        {
            name: 'Enterprise',
            description: 'For large organizations',
            monthlyPrice: 99,
            annualPrice: 79,
            features: ['Everything in Pro', 'Unlimited Storage', 'Custom Analytics', '24/7 Phone Support', 'SSO & SAML', 'Dedicated Manager', 'SLA Guarantee'],
            cta: 'Contact Sales',
            highlighted: false
        }
    ];

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '80px 40px',
            color: 'white'
        }}>
            {/* Header */}
            <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto 60px' }}>
                <h1 style={{ fontSize: '48px', fontWeight: '800', margin: '0 0 16px 0' }}>
                    Simple, Transparent Pricing
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '18px', lineHeight: '1.6', marginBottom: '32px' }}>
                    Choose the perfect plan for your needs. No hidden fees, cancel anytime.
                </p>

                {/* Toggle */}
                <div style={{
                    display: 'inline-flex',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '4px'
                }}>
                    <button
                        onClick={() => setIsAnnual(false)}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '10px',
                            border: 'none',
                            background: !isAnnual ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setIsAnnual(true)}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '10px',
                            border: 'none',
                            background: isAnnual ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        Annual
                        <span style={{
                            background: '#22c55e',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '700'
                        }}>
                            Save 20%
                        </span>
                    </button>
                </div>
            </div>

            {/* Pricing Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '24px',
                maxWidth: '1200px',
                margin: '0 auto'
            }}>
                {plans.map((plan) => (
                    <div
                        key={plan.name}
                        style={{
                            background: plan.highlighted
                                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                : 'rgba(255, 255, 255, 0.03)',
                            border: plan.highlighted ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '20px',
                            padding: '40px',
                            position: 'relative',
                            transform: plan.highlighted ? 'scale(1.05)' : 'scale(1)',
                            boxShadow: plan.highlighted ? '0 25px 80px rgba(102, 126, 234, 0.4)' : 'none'
                        }}
                    >
                        {plan.highlighted && (
                            <div style={{
                                position: 'absolute',
                                top: '-12px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: '#fbbf24',
                                color: '#1f2937',
                                padding: '6px 16px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '700',
                                textTransform: 'uppercase'
                            }}>
                                Most Popular
                            </div>
                        )}

                        <h3 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 8px 0' }}>{plan.name}</h3>
                        <p style={{ color: plan.highlighted ? 'rgba(255,255,255,0.8)' : '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>
                            {plan.description}
                        </p>

                        <div style={{ marginBottom: '32px' }}>
                            <span style={{ fontSize: '48px', fontWeight: '800' }}>
                                \${isAnnual ? plan.annualPrice : plan.monthlyPrice}
                            </span>
                            <span style={{ color: plan.highlighted ? 'rgba(255,255,255,0.7)' : '#94a3b8', fontSize: '16px' }}>/mo</span>
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px 0' }}>
                            {plan.features.map((feature) => (
                                <li key={feature} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    marginBottom: '14px',
                                    fontSize: '14px',
                                    color: plan.highlighted ? 'rgba(255,255,255,0.9)' : '#e2e8f0'
                                }}>
                                    <span style={{ color: '#22c55e', fontSize: '16px' }}>✓</span>
                                    {feature}
                                </li>
                            ))}
                        </ul>

                        <button
                            onClick={() => alert(\`Selected: \${plan.name}\`)}
                            style={{
                                width: '100%',
                                padding: '14px',
                                borderRadius: '12px',
                                border: plan.highlighted ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                                background: plan.highlighted ? 'white' : 'transparent',
                                color: plan.highlighted ? '#667eea' : 'white',
                                fontSize: '15px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            {plan.cta}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}`,
		dependencies: { 'react': '18', 'react-dom': '18' }
	},
	'VUE_ANALYTICS_OVERVIEW': {
		id: 'vue_analytics_overview',
		name: '🌿 Vue Analytics Overview (SFC)',
		code: `<template>
	<section class="analytics">
		<header class="hero">
			<div>
				<p class="eyebrow">Team Performance</p>
				<h1>Weekly Analytics</h1>
				<p class="subtitle">
					Track how your product is performing with real-time metrics and beautiful visualizations.
				</p>
			</div>
			<button class="action" @click="shuffleStats">Refresh Data</button>
		</header>

		<div class="cards">
			<article v-for="stat in stats" :key="stat.label" class="card">
				<div class="icon">{{ stat.icon }}</div>
				<p class="label">{{ stat.label }}</p>
				<p class="value">{{ stat.value }}</p>
				<p class="delta" :class="{ positive: stat.delta >= 0 }">
					<span>{{ stat.delta >= 0 ? '+' : ''}}{{ stat.delta }}%</span>
					<span>vs last week</span>
				</p>
			</article>
		</div>

		<section class="sessions">
			<h2>Sessions</h2>
			<div class="session-stats">
				<div>
					<p class="metric-label">Daily Active Users</p>
					<p class="metric-value">{{ dailyUsers.toLocaleString() }}</p>
				</div>
				<div>
					<p class="metric-label">Avg. Session Length</p>
					<p class="metric-value">{{ averageSession }} min</p>
				</div>
				<div>
					<p class="metric-label">Conversion Rate</p>
					<p class="metric-value">{{ conversionRate }}%</p>
				</div>
			</div>
		</section>
	</section>
</template>

<script setup>
import { ref } from 'vue'

const stats = ref([
	{ label: 'Active Users', value: '12,480', delta: 8.4, icon: '👥' },
	{ label: 'New Signups', value: '3,204', delta: 5.1, icon: '✨' },
	{ label: 'Revenue', value: '$48,920', delta: 12.7, icon: '💰' },
	{ label: 'Support Tickets', value: '86', delta: -3.5, icon: '🛠️' }
])

const dailyUsers = ref(7421)
const averageSession = ref(12.4)
const conversionRate = ref(4.2)

function shuffleStats() {
	stats.value = [...stats.value]
		.sort(() => Math.random() - 0.5)
		.map(stat => ({
			...stat,
			delta: Number((Math.random() * 14 - 3).toFixed(1))
		}))

	dailyUsers.value = Math.floor(6000 + Math.random() * 4000)
	averageSession.value = Number((10 + Math.random() * 5).toFixed(1))
	conversionRate.value = Number((3 + Math.random() * 2).toFixed(1))
}
</script>

<style scoped>
:global(body) {
	margin: 0;
	font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	background: #0f172a;
	color: #f8fafc;
}

.analytics {
	min-height: 100vh;
	padding: 3rem clamp(1.5rem, 5vw, 4rem);
	display: flex;
	flex-direction: column;
	gap: 2.5rem;
}

.hero {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 1.5rem;
	align-items: center;
}

.eyebrow {
	text-transform: uppercase;
	font-size: 0.85rem;
	letter-spacing: 0.2em;
	color: #94a3b8;
	margin-bottom: 0.5rem;
}

.hero h1 {
	font-size: clamp(2rem, 4vw, 3rem);
	margin: 0 0 0.5rem 0;
}

.subtitle {
	color: #cbd5f5;
	max-width: 520px;
	line-height: 1.5;
	margin: 0;
}

.action {
	background: #6366f1;
	color: white;
	border: none;
	padding: 0.85rem 1.5rem;
	border-radius: 999px;
	font-weight: 600;
	cursor: pointer;
	transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.action:hover {
	transform: translateY(-2px);
	box-shadow: 0 10px 25px rgba(99, 102, 241, 0.3);
}

.cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 1.5rem;
}

.card {
	background: rgba(15, 23, 42, 0.7);
	border: 1px solid rgba(148, 163, 184, 0.2);
	border-radius: 1.5rem;
	padding: 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
}

.icon {
	font-size: 1.5rem;
}

.label {
	color: #94a3b8;
	text-transform: uppercase;
	letter-spacing: 0.15em;
	font-size: 0.75rem;
	margin: 0;
}

.value {
	font-size: 2rem;
	font-weight: 700;
	margin: 0;
}

.delta {
	font-size: 0.9rem;
	color: #f87171;
	display: flex;
	gap: 0.25rem;
	align-items: baseline;
}

.delta.positive {
	color: #4ade80;
}

.sessions {
	background: rgba(15, 23, 42, 0.7);
	padding: 2rem;
	border-radius: 1.5rem;
	border: 1px solid rgba(148, 163, 184, 0.2);
}

.sessions h2 {
	margin: 0 0 1.5rem 0;
}

.session-stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 1.25rem;
}

.metric-label {
	font-size: 0.85rem;
	text-transform: uppercase;
	color: #94a3b8;
	margin: 0 0 0.35rem 0;
}

.metric-value {
	font-size: 1.5rem;
	margin: 0;
	font-weight: 600;
}

@media (max-width: 600px) {
	.hero {
		flex-direction: column;
		align-items: flex-start;
	}

	.cards {
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	}
}
</style>`,
		dependencies: { vue: '3.4.21' }
	},

	'SVELTE_STATS_WIDGET': {
		id: 'svelte_stats_widget',
		name: '🌱 Svelte Stats Widget',
		code: `<script>
	import { onMount } from 'svelte';

	let uptime = 98.3;
	let sparkline = [42, 55, 61, 49, 72, 68, 80];
	let timer;

	function randomize() {
		uptime = Number((95 + Math.random() * 5).toFixed(1));
		sparkline = sparkline.map((_, idx) => {
			const next = sparkline[idx + 1] ?? sparkline[0];
			return Math.max(30, Math.min(90, Math.round(next + (Math.random() - 0.5) * 12)));
		});
	}

	onMount(() => {
		timer = setInterval(randomize, 2500);
		return () => clearInterval(timer);
	});
</script>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		background: #050b18;
		color: #e2e8f0;
	}

	.card {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.widget {
		width: min(420px, 90vw);
		background: radial-gradient(circle at top, rgba(59, 130, 246, 0.2), rgba(15, 23, 42, 0.8));
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 24px;
		padding: 2rem;
		box-shadow: 0 25px 70px rgba(15, 23, 42, 0.8);
		backdrop-filter: blur(12px);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.sparkline {
		display: flex;
		align-items: flex-end;
		gap: 0.35rem;
	}

	.sparkline span {
		width: 14px;
		border-radius: 999px 999px 0 0;
		background: linear-gradient(180deg, #4ade80, #059669);
		transition: height 0.4s ease;
	}

	.uptime {
		text-align: center;
		margin: 2rem 0 1rem;
	}

	.uptime h2 {
		font-size: clamp(2.5rem, 7vw, 3.5rem);
		margin: 0;
	}

	.footer {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		color: #94a3b8;
	}
</style>

<div class="card">
	<div class="widget">
		<div class="header">
			<div>
				<p style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.2em; color: #94a3b8; margin: 0;">
					Service Uptime
				</p>
				<h1 style="margin: 0.4rem 0 0 0; font-size: 1.5rem;">Edge Functions</h1>
			</div>
			<div class="sparkline">
				{#each sparkline as value}
					<span style={"height: " + value + "px"}></span>
				{/each}
			</div>
		</div>

		<div class="uptime">
			<p style="margin: 0; color: #94a3b8;">Uptime (rolling 7d)</p>
			<h2>{uptime}%</h2>
			<p style="margin: 0; color: #4ade80;">+0.4% vs last period</p>
		</div>

		<div class="footer">
			<span>Last incident: 21d ago</span>
			<span>Monitored regions: 12</span>
		</div>
	</div>
</div>`,
		dependencies: { svelte: '5.45.2' }
	},

	'VANILLA_LANDING_HERO': {
		id: 'vanilla_landing_hero',
		name: '🧱 Vanilla Landing Hero',
		code: `<style>
	@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&display=swap');

	:root {
		color-scheme: dark;
		font-family: 'Space Grotesk', system-ui, sans-serif;
		background: #05060a;
		color: #f1f5f9;
	}

	body {
		margin: 0;
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hero {
		width: min(960px, 92vw);
		padding: clamp(2rem, 5vw, 4rem);
		border-radius: 32px;
		background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.35), transparent 60%),
			radial-gradient(circle at bottom right, rgba(96, 165, 250, 0.2), transparent 55%),
			linear-gradient(135deg, #0f172a, #0b1120);
		border: 1px solid rgba(148, 163, 184, 0.2);
		box-shadow: 0 40px 120px rgba(2, 6, 23, 0.7);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.12);
		font-size: 0.9rem;
		color: #cbd5f5;
	}

	h1 {
		margin: 1.6rem 0 0.8rem;
		font-size: clamp(2.8rem, 6vw, 4.5rem);
		line-height: 1.1;
	}

	p {
		color: #94a3b8;
		font-size: clamp(1rem, 2.4vw, 1.2rem);
		max-width: 640px;
		margin-bottom: 2rem;
	}

	.cta {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	button.primary {
		background: linear-gradient(135deg, #6366f1, #8b5cf6);
		border: none;
		color: white;
		padding: 0.95rem 1.8rem;
		border-radius: 999px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 20px 40px rgba(99, 102, 241, 0.35);
	}

	button.secondary {
		background: transparent;
		border: 1px solid rgba(148, 163, 184, 0.4);
		color: #cbd5f5;
		padding: 0.95rem 1.8rem;
		border-radius: 999px;
		font-size: 1rem;
		cursor: pointer;
	}
</style>

<section class="hero">
	<div class="badge">
		<span>✨</span>
		<span>Now shipping Roopik 1.0</span>
	</div>

	<h1>Design beautifully. Ship confidently.</h1>

	<p>
		Roopik is the AI-native design suite that lets you go from blank canvas to production-ready components in minutes.
	</p>

	<div class="cta">
		<button class="primary" data-cta>Start building</button>
		<button class="secondary">Tour the product</button>
	</div>
</section>

<script>
	const primary = document.querySelector('[data-cta]');
	primary?.addEventListener('click', () => {
		primary.textContent = 'Deploying...';
		setTimeout(() => {
			primary.textContent = 'Start building';
		}, 1200);
	});
</script>`,
		dependencies: {}
	}
};
