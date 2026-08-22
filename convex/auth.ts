import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email is required");
        const name = String(params.name ?? email).trim().slice(0, 120);
        return { email, name };
      },
      validatePasswordRequirements(password) {
        if (password.length < 12 || password.length > 256)
          throw new Error("Password must contain 12-256 characters");
      },
    }),
  ],
});
