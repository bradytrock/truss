import { SignInBrand, SignInCard, SignInScreen } from "@/components/sign-in-screen";

export default function LoginLoading() {
  return (
    <SignInScreen>
      <SignInCard>
        <div className="px-6 py-10 sm:px-11">
          <SignInBrand
            title="Sign in to TheRoofingCRM"
            subtitle="Welcome back! Please sign in to continue"
          />
        </div>
      </SignInCard>
    </SignInScreen>
  );
}
