import type { Metadata } from "next";
import "./globals.css";
import "./site.css";
export const metadata:Metadata={title:"FlowPick | 물류를 감이 아닌 흐름으로",description:"현장 진단과 디지털 시뮬레이션으로 물류센터 운영을 설계하는 물류 컨설팅 회사",openGraph:{title:"FlowPick | 물류를 감이 아닌 흐름으로",description:"물류센터 운영 진단과 카트·AMR 피킹 시뮬레이션",images:["/og.png"]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
