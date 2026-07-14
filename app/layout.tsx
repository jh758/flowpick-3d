import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"FlowPick 3D | 물류센터 피킹 시뮬레이터",description:"격자형 센터 레이아웃과 실제 오더를 사용하는 카트·AMR 피킹 시뮬레이터"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
