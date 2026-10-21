import type {ReactNode} from 'react';
export default function ErrorNotice({message,children}:{message:string;children?:ReactNode}){
 if(!message)return null;const [text,details]=message.split('\nTechnical details: ');
 return <div className="error-notice"><p className="error" role="alert">{text}</p>{children&&<div className="error-actions">{children}</div>}{details&&<details><summary>Technical details</summary><p>{details}</p><p>Share this reference when reporting the problem.</p></details>}</div>;
}
