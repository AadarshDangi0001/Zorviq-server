export interface JWTPayload {
  sub: string;         // userId
  email: string;
  plan: "free" | "pro";
  iat: number;
  exp: number;
}
