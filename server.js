
function csrfCheck(req, res, next) {
  const origin = req.get("origin");

  // Allow requests without an Origin header.
  if (!origin) return next();

  // Compare against the public URL configured for this deployment.
  const allowedOrigin = process.env.APP_ORIGIN;

  if (!allowedOrigin || origin !== allowedOrigin) {
    return res.status(403).json({
      error: "Cross-origin request blocked."
    });
  }

  next();
}app.use("/api", csrfCheck);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
