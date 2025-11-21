
import React from 'react';
import Spinner from './Spinner';

type ButtonProps = {
  isLoading?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function Button({ isLoading = false, children, variant = 'primary', className = '', ...props }: ButtonProps) {
  const baseClasses = "relative flex justify-center items-center font-medium py-3 px-6 rounded-xl transition-all duration-300 ease-out transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 tracking-wide text-sm";
  
  const variants = {
    primary: "bg-white text-black hover:bg-cyan-50 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] border border-transparent",
    secondary: "glass-panel text-white hover:bg-white/10 border-white/10 hover:border-white/20",
    ghost: "bg-transparent text-gray-400 hover:text-white hover:bg-white/5",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
  };

  return (
    <button
      {...props}
      className={`${baseClasses} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
    >
      <span className={`flex items-center gap-2 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        {children}
      </span>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
    </button>
  );
}

export default Button;
