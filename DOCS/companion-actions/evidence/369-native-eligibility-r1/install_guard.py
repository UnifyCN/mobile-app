"""Add only a sandbox dependency to an owned Debug test installation."""
from lab import *
import hashlib
import shutil
import struct

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
original = B / 'derived-data/Build/Products/Debug-iphonesimulator/Unify.app'
app = B / 'test-installation/Unify.app'
assert not app.exists()
app.parent.mkdir()
shutil.copytree(original, app)
source = (B / 'app-guard.c').read_text()
source = '#include <mach-o/dyld.h>\n#include <string.h>\n' + source
source = source.replace('const char *path=getenv("IOS359_PROFILE");if(!path)_exit(90);',
    'char location[4096]; uint32_t cap=sizeof(location); if(_NSGetExecutablePath(location,&cap))_exit(90); '
    'char *slash=strrchr(location,\'/\'); if(!slash)_exit(90); strcpy(slash+1,"local-only.bytecode"); const char *path=location;')
(E / 'app-guard-fixed.c').write_text(source)
sdk = run(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path']).stdout.decode().strip()
parts=[]
for arch in ['arm64', 'x86_64']:
    output=B/f'guard-{arch}.dylib'
    run(['xcrun', 'clang', '-target', f'{arch}-apple-ios16.0-simulator', '-isysroot', sdk,
         '-dynamiclib', '-install_name', '@executable_path/native369-guard.dylib',
         E/'app-guard-fixed.c', '-o', output])
    parts.append(output)
run(['xcrun', 'lipo', '-create', *parts, '-output', app/'native369-guard.dylib'])
shutil.copyfile(B/'local-only.bytecode', app/'local-only.bytecode')
path=app/'Unify.debug.dylib'
data=bytearray(path.read_bytes())
before=bytes(data)
magic=struct.unpack_from('>I',data)[0]
assert magic==0xcafebabe
count=struct.unpack_from('>I',data,4)[0]
slices=[struct.unpack_from('>IIIII',data,8+i*20)[2:4] for i in range(count)]
name=b'@executable_path/native369-guard.dylib\0'
size=(24+len(name)+7)//8*8
command=struct.pack('<IIIIII',0xc,size,24,0,0,0)+name
command+=b'\0'*(size-len(command))
changes=[]
for offset,length in slices:
    assert struct.unpack_from('<I',data,offset)[0]==0xfeedfacf
    n,oldsize=struct.unpack_from('<II',data,offset+16)
    end=offset+32+oldsize
    assert not any(data[end:end+size]), 'No owned load-command padding'
    # Appending keeps all existing dynamic-library ordinals and commands intact.
    data[end:end+size]=command
    struct.pack_into('<II',data,offset+16,n+1,oldsize+size)
    assert data[offset+32:end]==before[offset+32:end]
    assert data[end+size:offset+length]==before[end+size:offset+length]
    changes.append(dict(slice_offset=offset,slice_bytes=length,old_commands=n,new_commands=n+1,
                        old_command_bytes=oldsize,new_command_bytes=oldsize+size))
path.write_bytes(data)
run(['codesign','--force','--deep','--sign','-',app])
run(['codesign','--verify','--deep','--strict',app])
dependencies=run(['otool','-L',path]).stdout.decode()
assert dependencies.count('@executable_path/native369-guard.dylib')==2
run(['xcrun','simctl','install',U,app])
installed=Path(run(['xcrun','simctl','get_app_container',U,APP,'app'],private=True).stdout.decode().strip())
(B/'private/installed-app.txt').write_text(str(installed))
names=['Unify','Unify.debug.dylib','native369-guard.dylib','local-only.bytecode','Info.plist']
rows=[dict(path=n,installed_sha256=sha(installed/n),test_installation_sha256=sha(app/n),equal=sha(installed/n)==sha(app/n)) for n in names]
assert all(x['equal'] for x in rows)
(E/'installed-native.json').write_text(json.dumps(dict(
    source_app=str(original),unmodified_build_hashes={n:sha(original/n) for n in ['Unify','Unify.debug.dylib','Info.plist']},
    installed=rows,guard_changes=changes,dependencies=dependencies,
    product_source_modified=False,entitlement_file_modified=False,signing='local ad hoc test installation only',
    cold_launch_guard='sandbox constructor is a dependency of Unify.debug.dylib; it reads app-local policy before product initializers',
),indent=2)+'\n')
print('Owned native test installation is signed, installed, and hash verified.')
