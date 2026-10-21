import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Voice Lab · Manoj',description:'Learn voice AI step by step: text to speech and microphone transcription with Cartesia.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang='en'><body>{children}</body></html>}
