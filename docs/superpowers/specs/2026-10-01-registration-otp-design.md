# Registration OTP Design

## Goal

Update the Fire3D web registration experience to verify an email with the backend OTP flow before an account is created.

## Flow

The registration form keeps the entered account details only in browser component state. The user first requests an OTP for the entered email, verifies its six digits, and receives a short-lived `registrationToken`. The final registration request carries the original form data and that token. Changing the email clears the OTP proof.

`POST /api/auth/registration/request-otp` returns `202`; the UI does not infer that an account exists from that response. `POST /api/auth/registration/verify-otp` returns the proof token. Both trainee and organization registration calls include it.

## Existing Pending Accounts

When password login returns backend code `EMAIL_NOT_VERIFIED`, the login form displays a dedicated verification panel. Its resend action calls `POST /api/auth/resend-verification` and is labelled “Gửi lại mã OTP” per product direction. Current backend behavior still sends its legacy verification email; the planned backend change will align this endpoint with the UI wording.

## Safety and UX

No password, OTP, or registration token is persisted in session/local storage. API errors remain backend-derived. Buttons prevent duplicate requests while active, the alert remains accessible, and the existing login route remains usable.

## Tests

Playwright stubs the three OTP endpoints and confirms the final payload only contains the registration token after successful OTP verification. It also verifies the pending-account panel and resend request.
