import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Enter your phone number or email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export default function LoginPage() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const currentYear = new Intl.DateTimeFormat('en-IN', { year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });

  async function submit(values) {
    setError('');
    const login = values.login.includes('@') ? { email: values.login.toLowerCase() } : { phone: values.login };
    try {
      const { data } = await api.post('/auth/login', { ...login, password: values.password });
      setUser(data.data.user);
      showToast('Welcome back.');
      navigate('/');
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  return <div className="auth-page"><div className="auth-brand"><span className="brand-mark"><Building2 size={19} /></span><span>haven<span className="brand-period">.</span></span></div><main className="auth-card"><div className="auth-icon"><Building2 size={22} /></div><h1>Welcome back</h1><p>Sign in to manage your property, rooms, tenants, and finances.</p><form onSubmit={handleSubmit(submit)} noValidate><label>Phone number or email<input {...register('login')} autoComplete="username" placeholder="+91 98765 43210 or owner@example.com" />{errors.login && <small className="field-error">{errors.login.message}</small>}</label><label>Password<div className="password-field"><input {...register('password')} type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{errors.password && <small className="field-error">{errors.password.message}</small>}</label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : 'Sign in'} {!isSubmitting && <ArrowRight size={16} />}</button></form><div className="auth-secure"><ShieldCheck size={15} /> Owner and administrator access only</div></main><footer className="auth-footer">© {currentYear} Haven Property Care <span>·</span> Made for better living</footer></div>;
}
