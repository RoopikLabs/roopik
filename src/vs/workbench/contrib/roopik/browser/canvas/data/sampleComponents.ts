/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sample AI-generated components for testing Mode 1 preview system
 * These follow the "Golden Prompt" format with dependency manifests
 *
 * FORMAT: Each component has a DEPENDENCIES comment at the top that maps
 * npm packages to their CDN URLs and global variable names.
 */

export interface SampleComponent {
	id: string;
	name: string;
	code: string;
}

// ============================================
// Sample Components (9 total)
// ============================================

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

export const sampleLoginSplit = `// DEPENDENCIES: [{"npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"}, {"npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"}]

import React, { useState } from 'react';

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
}`;

export const sampleLoginDark = `// DEPENDENCIES: [{"npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"}, {"npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"}]

import React, { useState } from 'react';

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
                            placeholder="your@email.com"
                            style={{
                                width: '100%', padding: '14px 16px', fontSize: '15px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '10px', color: 'white', outline: 'none',
                                boxSizing: 'border-box'
                            }}
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
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
                                width: '100%', padding: '14px 16px', fontSize: '15px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '10px', color: 'white', outline: 'none',
                                boxSizing: 'border-box'
                            }}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        style={{
                            width: '100%', padding: '14px', fontSize: '15px', fontWeight: '600',
                            color: 'white',
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            border: 'none', borderRadius: '10px', cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
                            textTransform: 'uppercase', letterSpacing: '0.5px'
                        }}
                    >
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    );
}`;

export const sampleOnboardingModern = `// DEPENDENCIES: [{"npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"}, {"npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"}]

import React, { useState } from 'react';

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
}`;

export const sampleOnboardingCards = `// DEPENDENCIES: [{"npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"}, {"npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"}]

import React, { useState } from 'react';

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
}`;

export const sampleOnboardingSlider = `// DEPENDENCIES: [{"npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"}, {"npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"}]

import React, { useState } from 'react';

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

                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '32px' }}>
                    {slides.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setActiveSlide(index)}
                            style={{
                                width: activeSlide === index ? '48px' : '12px', height: '12px',
                                borderRadius: '6px',
                                background: activeSlide === index ? 'white' : 'rgba(255, 255, 255, 0.4)',
                                border: 'none', cursor: 'pointer', transition: 'all 0.3s ease'
                            }}
                        />
                    ))}
                </div>

                {activeSlide === slides.length - 1 && (
                    <button
                        onClick={() => alert('Welcome aboard!')}
                        style={{
                            padding: '16px 48px', fontSize: '18px', fontWeight: '700',
                            color: '#4facfe', background: 'white', border: 'none',
                            borderRadius: '50px', cursor: 'pointer'
                        }}
                    >
                        Get Started Now
                    </button>
                )}
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
}`;

// ============================================
// Sample Components Array
// ============================================

/**
 * All sample components ready for loading onto the canvas
 * Note: The MUI sample is excluded as it requires additional CDN handling
 * that needs the full PreviewManager transformation logic
 */
export const SAMPLE_COMPONENTS: SampleComponent[] = [
	{
		id: 'button_sample_001',
		name: 'Simple Button',
		code: sampleButton
	},
	{
		id: 'counter_sample_002',
		name: 'Interactive Counter',
		code: sampleCounter
	},
	{
		id: 'card_sample_003',
		name: 'Styled Card',
		code: sampleCard
	},
	{
		id: 'login_split_004',
		name: 'Login - Split Screen',
		code: sampleLoginSplit
	},
	{
		id: 'login_dark_005',
		name: 'Login - Dark Glass',
		code: sampleLoginDark
	},
	{
		id: 'onboarding_modern_006',
		name: 'Onboarding - Modern',
		code: sampleOnboardingModern
	},
	{
		id: 'onboarding_cards_007',
		name: 'Onboarding - Cards',
		code: sampleOnboardingCards
	},
	{
		id: 'onboarding_slider_008',
		name: 'Onboarding - Slider',
		code: sampleOnboardingSlider
	}
];

/**
 * Get a sample component by ID
 */
export function getSampleComponent(id: string): SampleComponent | undefined {
	return SAMPLE_COMPONENTS.find(c => c.id === id);
}

/**
 * Get all sample component IDs for the floating toolbar
 */
export function getSampleComponentIds(): string[] {
	return SAMPLE_COMPONENTS.map(c => c.id);
}
