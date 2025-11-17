/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sample AI-generated components for testing Mode 1 preview system
 * These follow the "Golden Prompt" format with dependency manifests
 */

export const sampleButton = `// DEPENDENCIES: [{"npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"}, {"npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"}]

import React from 'react';

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
}`;

export const sampleCounter = `// DEPENDENCIES: [{"npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"}, {"npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"}]

import React, { useState } from 'react';

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
}`;

export const sampleCard = `// DEPENDENCIES: [{"npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"}, {"npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"}]

import React from 'react';

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
}`;

/**
 * Sample component data objects ready for loading
 */
export const SAMPLE_COMPONENTS = [
	{
		id: 'button_sample_001',
		code: sampleButton,
		name: 'Simple Button',
		dependencies: [] // Will be parsed by PreviewManager
	},
	{
		id: 'counter_sample_002',
		code: sampleCounter,
		name: 'Interactive Counter',
		dependencies: [] // Will be parsed by PreviewManager
	},
	{
		id: 'card_sample_003',
		code: sampleCard,
		name: 'Styled Card',
		dependencies: [] // Will be parsed by PreviewManager
	}
];
