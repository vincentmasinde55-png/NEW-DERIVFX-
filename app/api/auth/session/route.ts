import {NextRequest,NextResponse} from "next/server";
export async function GET(req:NextRequest){return NextResponse.json({authenticated:!!req.cookies.get("deriv_access_token")})}
