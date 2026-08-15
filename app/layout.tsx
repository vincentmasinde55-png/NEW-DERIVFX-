import "./globals.css";
import "./dbot-transactions.css";
import type {Metadata} from "next";
export const metadata:Metadata={title:"DerivFX",description:"DerivFX automated trading dashboard"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
