import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/ToastContext.jsx';

const isIndianPhone = (value) => {
  const compact = value.replace(/[\s()-]/g, '');
  return /^(?:\+91|91|0)?[6-9]\d{9}$/.test(compact);
};
const passwordRule = z.string().min(10, 'Use at least 10 characters.').max(72).regex(/[a-z]/, 'Add a lowercase letter.').regex(/[A-Z]/, 'Add an uppercase letter.').regex(/[0-9]/, 'Add a number.');
const loginSchema = z.object({ phone: z.string().trim().refine((value) => value.includes('@') ? z.string().email().safeParse(value).success : isIndianPhone(value), 'Enter a valid Indian mobile number or email address.'), password: z.string().min(1, 'Enter your password.') });
const registrationSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(100),
  phone: z.string().trim().refine(isIndianPhone, 'Enter a valid Indian mobile number.'),
  password: passwordRule,
  confirmPassword: z.string().min(1, 'Confirm your password.'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).default('PREFER_NOT_TO_SAY'),
}).refine((values) => values.password === values.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });

export default function LoginPage({ register = false }) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const currentYear = new Intl.DateTimeFormat('en-IN', { year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
  const { register: field, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(register ? registrationSchema : loginSchema), defaultValues: register ? { gender: 'PREFER_NOT_TO_SAY' } : {} });

  async function submit(values) {
    setError('');
    try {
      const payload = register || !values.phone.includes('@') ? { ...values } : { email: values.phone, password: values.password };
      delete payload.confirmPassword;
      const { data } = await api.post(register ? '/auth/register' : '/auth/login', payload);
      setUser(data.data.user);
      showToast(register ? 'Your account is ready.' : 'Welcome back.');
      navigate('/');
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  return <div className="auth-page"><div className="auth-brand"><span className="brand-mark"><Building2 size={19} /></span><span>haven<span className="brand-period">.</span></span></div><main className="auth-card"><div className="auth-icon"><Building2 size={22} /></div><h1>{register ? 'Create your account' : 'Welcome back'}</h1><p>{register ? 'Sign up to find and manage your stay.' : 'Sign in to manage your property, all in one place.'}</p><form onSubmit={handleSubmit(submit)} noValidate>{register && <><label>Full name<input {...field('name')} autoComplete="name" placeholder="e.g. Aditi Sharma" />{errors.name && <small className="field-error">{errors.name.message}</small>}</label><label>Gender<select {...field('gender')}><option value="PREFER_NOT_TO_SAY">Prefer not to say</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></select></label></>}<label>{register ? 'Phone number' : 'Phone number or email'}<input {...field('phone')} type={register ? 'tel' : 'text'} inputMode={register ? 'tel' : 'text'} autoComplete={register ? 'tel' : 'username'} placeholder={register ? '98765 43210' : '+91 98765 43210 or owner@example.com'} />{errors.phone && <small className="field-error">{errors.phone.message}</small>}</label><label>Password<div className="password-field"><input {...field('password')} type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'At least 10 characters' : 'Enter your password'} />{!register && <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>}</div>{errors.password && <small className="field-error">{errors.password.message}</small>}{register && <small className="field-hint">Use 10+ characters with uppercase, lowercase, and a number.</small>}</label>{register && <label>Confirm password<div className="password-field"><input {...field('confirmPassword')} type={visible ? 'text' : 'password'} autoComplete="new-password" placeholder="Enter your password again" /><button type="button" aria-label={visible ? 'Hide passwords' : 'Show passwords'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{errors.confirmPassword && <small className="field-error">{errors.confirmPassword.message}</small>}</label>}{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : register ? 'Create account' : 'Sign in'} {!isSubmitting && <ArrowRight size={16} />}</button></form><div className="auth-switch">{register ? 'Already have an account?' : 'New to Haven?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></div><div className="auth-secure"><ShieldCheck size={15} /> Your information is encrypted and secure</div></main><footer className="auth-footer">© {currentYear} Haven Property Care <span>·</span> Made for better living</footer></div>;
}
