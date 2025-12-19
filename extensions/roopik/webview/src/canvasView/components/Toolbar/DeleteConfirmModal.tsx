/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

interface DeleteConfirmModalProps {
	sandboxId: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export function DeleteConfirmModal({ sandboxId, onConfirm, onCancel }: DeleteConfirmModalProps) {
	return (
		<div
			className="modal-overlay"
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: 'rgba(0, 0, 0, 0.6)',
				backdropFilter: 'blur(8px)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 10000,
				animation: 'modal-fade-in 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
			}}
			onClick={onCancel}
		>
			<div
				className="modal-content"
				style={{
					background: 'linear-gradient(135deg, rgba(40, 40, 45, 0.95) 0%, rgba(30, 30, 35, 0.95) 100%)',
					backdropFilter: 'blur(20px) saturate(180%)',
					border: '1px solid rgba(255, 255, 255, 0.1)',
					borderRadius: '16px',
					padding: '32px',
					minWidth: '400px',
					maxWidth: '500px',
					boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
					animation: 'modal-slide-up 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Icon */}
				<div
					style={{
						width: '64px',
						height: '64px',
						borderRadius: '50%',
						background: 'rgba(239, 68, 68, 0.15)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						margin: '0 auto 24px',
					}}
				>
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#ef4444"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M3 6h18" />
						<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
						<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
						<line x1="10" y1="11" x2="10" y2="17" />
						<line x1="14" y1="11" x2="14" y2="17" />
					</svg>
				</div>

				{/* Title */}
				<h2
					style={{
						fontSize: '20px',
						fontWeight: 600,
						color: 'rgba(255, 255, 255, 0.95)',
						textAlign: 'center',
						marginBottom: '12px',
					}}
				>
					Delete Sandbox?
				</h2>

				{/* Description */}
				<p
					style={{
						fontSize: '14px',
						color: 'rgba(255, 255, 255, 0.6)',
						textAlign: 'center',
						marginBottom: '32px',
						lineHeight: '1.6',
					}}
				>
					Are you sure you want to delete <strong style={{ color: '#7c87f7' }}>{sandboxId}</strong>?
					<br />
					This action cannot be undone.
				</p>

				{/* Buttons */}
				<div
					style={{
						display: 'flex',
						gap: '12px',
					}}
				>
					<button
						onClick={onCancel}
						style={{
							flex: 1,
							padding: '12px 24px',
							fontSize: '14px',
							fontWeight: 600,
							color: 'rgba(255, 255, 255, 0.8)',
							background: 'rgba(255, 255, 255, 0.1)',
							border: '1px solid rgba(255, 255, 255, 0.2)',
							borderRadius: '8px',
							cursor: 'pointer',
							transition: 'all 0.2s ease',
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
							e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
							e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
						}}
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						style={{
							flex: 1,
							padding: '12px 24px',
							fontSize: '14px',
							fontWeight: 600,
							color: '#ffffff',
							background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
							border: '1px solid rgba(239, 68, 68, 0.5)',
							borderRadius: '8px',
							cursor: 'pointer',
							transition: 'all 0.2s ease',
							boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
							e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
							e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
						}}
					>
						Delete
					</button>
				</div>
			</div>

			<style>{`
				@keyframes modal-fade-in {
					from {
						opacity: 0;
					}
					to {
						opacity: 1;
					}
				}

				@keyframes modal-slide-up {
					from {
						opacity: 0;
						transform: translateY(20px) scale(0.95);
					}
					to {
						opacity: 1;
						transform: translateY(0) scale(1);
					}
				}
			`}</style>
		</div>
	);
}
