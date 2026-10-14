# 守心便签 AAB 组装器（被 dev/build-aab.mjs 调用，也可单独手跑）
# 用法：python aab_pack.py <proto.apk> <base.apk> <classes.dex> <out.aab>
#   proto.apk  = aapt2 convert --output-format=proto 的产物
#                （AndroidManifest.xml / resources.pb / res/** 均为 proto 格式）
#   base.apk   = aapt2 link 的标准产物（取 assets/**，与 convert 无关）
# 组装结构（Android App Bundle 规范）：
#   base/manifest/AndroidManifest.xml（proto manifest）
#   base/resources.pb（proto 资源表）
#   base/dex/classes.dex
#   base/res/**、base/assets/**
#   BundleConfig.pb（空 = 全默认配置）
# 带格式自检：manifest/resources.pb 必须是 proto（首字节 0x0A），dex 必须有 dex 魔数，
# 防止错拿 base.apk 的二进制 XML 混入（bundletool 会拒收二进制格式）。
import sys
import zipfile

def main():
    proto_apk, base_apk, dex_path, out_path = sys.argv[1:5]

    aab = zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED)
    try:
        with zipfile.ZipFile(proto_apk) as z:
            names = set(z.namelist())
            for need in ('AndroidManifest.xml', 'resources.pb'):
                if need not in names:
                    raise SystemExit('aab_pack: proto.apk 缺少 ' + need + '（aapt2 convert 产物不符？）')
            man = z.read('AndroidManifest.xml')
            res_pb = z.read('resources.pb')
            if man[:1] != b'\x0a' or res_pb[:1] != b'\x0a':
                raise SystemExit('aab_pack: manifest/resources.pb 不是 proto 格式（首字节非 0x0A）——检查 convert 步骤')
            aab.writestr('base/manifest/AndroidManifest.xml', man)
            aab.writestr('base/resources.pb', res_pb)
            for n in sorted(z.namelist()):
                if n.startswith('res/') and not n.endswith('/'):
                    aab.writestr('base/' + n, z.read(n))

        with zipfile.ZipFile(base_apk) as z:
            n_assets = 0
            for n in sorted(z.namelist()):
                if n.startswith('assets/') and not n.endswith('/'):
                    aab.writestr('base/' + n, z.read(n))
                    n_assets += 1
            if n_assets == 0:
                raise SystemExit('aab_pack: base.apk 里没有 assets/ —— -A 参数丢了？')
            print('aab_pack: assets ' + str(n_assets) + ' 个文件')

        with open(dex_path, 'rb') as f:
            dex = f.read()
        if dex[:3] != b'dex':
            raise SystemExit('aab_pack: classes.dex 魔数不对')
        aab.writestr('base/dex/classes.dex', dex)
        # BundleConfig 不能全空：bundletool 读取 config.bundletool.version 并校验格式
        # （字段号已用 bundletool 自带 proto 类实证：BundleConfig.bundletool=1，Bundletool.version=2）
        aab.writestr('BundleConfig.pb', b'\x0a\x08\x12\x06' + b'1.18.1')
    finally:
        aab.close()
    print('aab_pack: 组装完成 ' + out_path)

if __name__ == '__main__':
    main()
