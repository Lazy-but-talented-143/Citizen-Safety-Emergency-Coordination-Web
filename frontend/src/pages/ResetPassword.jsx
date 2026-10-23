import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";

export default function ResetPassword(){
 const [params]=useSearchParams(); const navigate=useNavigate(); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [message,setMessage]=useState("");
 const submit=async(e)=>{e.preventDefault();setError("");try{await api.post("password-reset/confirm/",{uid:params.get("uid"),token:params.get("token"),new_password:password});setMessage("Password reset successfully. You can login now.");setTimeout(()=>navigate("/login"),800);}catch(x){setError(x.response?.data?.error||"Invalid or expired reset link.");}};
 return <div className="login-page"><div className="login-card"><div className="logo">CS</div><h1>Reset Password</h1><p className="subtitle">Set a new password for your Citizen Safety account.</p><form onSubmit={submit}><label>New Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter new password" required/>{error&&<div className="error-message">{error}</div>}{message&&<div className="success-message">{message}</div>}<button className="primary-button">Reset Password</button><p className="auth-link"><Link to="/login">Back to Login</Link></p></form></div></div>;
}
