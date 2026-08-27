import { AuthForm } from "@/components/auth/auth-form";

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  const redirect = typeof searchParams.redirect === "string" ? searchParams.redirect : undefined;
  return <AuthForm mode="register" redirect={redirect} />;
}
