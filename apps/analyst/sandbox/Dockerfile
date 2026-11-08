# The sandbox image: python + the data stack, nothing else.
# No credentials, no tooling for the network, no package manager at runtime.
FROM python:3.12-slim
RUN pip install --no-cache-dir pandas numpy matplotlib \
 && rm -rf /root/.cache
# Baked into the image so the container needs no `--env` flags (keeps the
# "no env into the sandbox" guarantee literally true and testable).
ENV MPLBACKEND=Agg MPLCONFIGDIR=/tmp/mpl PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 GPG_KEY=
WORKDIR /work
