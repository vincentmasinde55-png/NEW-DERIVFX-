"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {DerivWS} from "../lib/deriv";

const tabs=["Dashboard","Bot Builder","AI Bots","Quick Bot","Free Bots","Signals","Analysis","Auto Trader","Deriv Course"];
const tabImages:Record<string,string>={"Dashboard":"/tab-images/dashboard.svg","Bot Builder":"/tab-images/bot-builder.svg","AI Bots":"/tab-images/ai-bots.svg","Quick Bot":"/tab-images/quick-bot.svg","Free Bots":"/tab-images/free-bots.svg","Signals":"/tab-images