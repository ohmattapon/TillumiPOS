import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, unwrap } from '@/lib/api'
import { meQuery } from '@/lib/queries'

export function LoginPage() {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => unwrap(api.auth.login.post({ username, password })),
    onSuccess: (user) => queryClient.setQueryData(meQuery.queryKey, user),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate()
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-sidebar p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Store className="size-6" />
          </span>
          <CardTitle className="text-xl">EasyPOS</CardTitle>
          <CardDescription>เข้าสู่ระบบเพื่อเริ่มขาย</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">ชื่อผู้ใช้</Label>
              <Input
                id="username"
                className="h-11 text-base"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <Input
                id="password"
                type="password"
                className="h-11 text-base"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {login.error && (
              <p role="alert" className="text-sm text-destructive">
                {login.error.message}
              </p>
            )}
            <Button type="submit" disabled={login.isPending} className="h-11 w-full text-base">
              {login.isPending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
