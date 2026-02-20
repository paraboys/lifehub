import prisma from "../../config/db.js";
import { generateAccessToken, generateRefreshToken } from "../../common/authUtils.js";
import * as service from "./auth.service.js";
import { buildPhoneCandidates, sendOTP, verifyOTP } from "./otp.service.js";

const publicUser = (u) => ({
  id: u.id.toString(),
  name: u.name,
  phone: u.phone,
  email: u.email,
  roles: (() => {
    const rows = (u.user_roles || [])
      .map(row => row.roles?.role_name)
      .filter(Boolean)
      .map(role => String(role).toUpperCase());
    return rows.length ? rows : ["CUSTOMER"];
  })()
});

export const signup = async (req, res) => {
  try {
    const user = await service.signupUser(req.body);

    res.status(201).json({
      message: "User registered successfully",
      user: publicUser(user)
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const login = async (req, res) => {
  try {
    const data = await service.loginUser(req.body, {
      device: req.headers["x-device-id"] || req.headers["user-agent"],
      ip: req.ip
    });

    res.json({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: publicUser(data.user)
    });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
};
export const refresh = async (req,res)=>{
  try{
    const tokens = await service.rotateRefreshToken(req.body.refreshToken);
    res.json(tokens);
  }catch(e){
    res.status(401).json({error:e.message});
  }
};
export const logout = async (req,res)=>{
  try {
    await prisma.user_sessions.delete({
      where:{ refresh_token:req.body.refreshToken }
    });
    res.json({message:"Logged out securely"});
  } catch {
    res.json({ message: "Logged out securely" });
  }
};

export const requestOtpLogin = async (req,res)=>{
  try{
    if (!req.body?.phone) {
      throw new Error("phone is required");
    }
    await sendOTP(req.body.phone);
    res.json({message:"OTP sent"});
  }catch(e){
    res.status(400).json({error:e.message});
  }
};

export const loginWithOtp = async (req,res)=>{
  try{
    if (!req.body?.phone) {
      throw new Error("phone is required");
    }
    if (!req.body?.code) {
      throw new Error("code is required");
    }
    await verifyOTP(req.body.phone, req.body.code);

    const candidates = buildPhoneCandidates(req.body.phone);
    const user = await prisma.users.findFirst({
      where: {
        phone: {
          in: candidates
        }
      },
      include: {
        user_roles: { include: { roles: true } }
      }
    });

    if(!user) throw new Error("User not registered");

    const payload = { id: user.id.toString() };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.user_sessions.create({
      data: {
        user_id: user.id,
        refresh_token: refreshToken,
        device: req.headers["x-device-id"] || req.headers["user-agent"] || "unknown",
        ip: req.ip,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id:user.id.toString(),
        name:user.name,
        phone:user.phone,
        roles: (() => {
          const rows = (user.user_roles || [])
            .map(row => row.roles?.role_name)
            .filter(Boolean)
            .map(role => String(role).toUpperCase());
          return rows.length ? rows : ["CUSTOMER"];
        })()
      }
    });
  }catch(e){
    res.status(401).json({error:e.message});
  }
};

export const sessions = async (req, res) => {
  try {
    const items = await service.listSessions(req.user.id);
    res.json({
      sessions: items.map(s => ({
        id: s.id.toString(),
        device: s.device,
        ip: s.ip,
        createdAt: s.created_at,
        expiresAt: s.expires_at
      }))
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const revokeSession = async (req, res) => {
  try {
    await service.revokeSession(req.user.id, req.params.sessionId);
    res.json({ message: "Session revoked" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

