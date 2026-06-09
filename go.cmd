:: Rode na raiz do projeto: C:\EngageSolar

docker login

set REPO=allanciqueira
set TAG=latest

:: dashboard (front estático — nginx)
docker build -f apps/admin-dashboard/Dockerfile -t vivaengage-admin-dashboard:%TAG% apps/admin-dashboard
docker tag vivaengage-admin-dashboard:%TAG% %REPO%/vivaengage-admin-dashboard:%TAG%
docker push %REPO%/vivaengage-admin-dashboard:%TAG%