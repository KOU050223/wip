# Cloudflare Containers は linux/amd64 でのみ動作するため、明示的に固定する。
# （Apple Silicon から wrangler deploy する場合もこの指定でクロスビルドされる。）
FROM --platform=linux/amd64 golang:1.27-alpine AS build

WORKDIR /src

# 依存の取得だけを先に行い、ソース変更時のレイヤーキャッシュを効かせる。
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 で静的リンクし、scratch 相当の最小イメージで動くようにする。
# -trimpath と -ldflags="-s -w" はバイナリサイズを削るため。
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM --platform=linux/amd64 gcr.io/distroless/static-debian12:nonroot

# マネージドPostgres への TLS 接続でルート証明書が必要になるが、
# distroless/static には ca-certificates が同梱されているためコピー不要。

WORKDIR /app
COPY --from=build /out/server /app/server

# Container クラスの defaultPort と、backend の PORT のデフォルトに揃える。
EXPOSE 8080
ENV PORT=8080

USER nonroot:nonroot
ENTRYPOINT ["/app/server"]
