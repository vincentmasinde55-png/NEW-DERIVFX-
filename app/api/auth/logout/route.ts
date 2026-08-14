import {NextResponse} from "next/server";
export async function POST(){const r=NextResponse.json({ok:true});r.cookies.delete("deriv_access_token");return r}
