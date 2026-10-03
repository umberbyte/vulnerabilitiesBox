"""Small lxml fixture for XPath/XSLT extension registration boundaries."""
import json
import sys
from pathlib import Path

from lxml import etree


HOME = Path('/tmp/execution-fixture')
MARKER = HOME / 'extension-marker.txt'
SAFE_XPATH = 'string(/root/public)'
SAFE_XSLT = ('<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" '
             'version="1.0"><xsl:output method="text"/><xsl:template match="/">'
             '<xsl:value-of select="/root/public"/></xsl:template></xsl:stylesheet>')


def marker(_context, *_args):
    MARKER.write_text('called', encoding='utf-8')
    return 'extension-marker-called'


def main():
    request = json.load(sys.stdin)
    variant = request['variant']
    vulnerable = request['vulnerable'] is True
    value = request['input']
    document = etree.parse(str(HOME / 'source.xml'), etree.XMLParser(resolve_entities=False, no_network=True))
    if variant == 'B0109':
        if not vulnerable and value != SAFE_XPATH:
            return {'code': 400, 'output': '', 'marker': False}
        expression = etree.XPath(value if vulnerable else SAFE_XPATH,
                                 namespaces={'ext': 'urn:benchmark-extension'},
                                 extensions={('urn:benchmark-extension', 'marker'): marker} if vulnerable else {})
        result = expression(document)
        output = str(result)
    elif variant == 'B0116':
        if not vulnerable and value != SAFE_XSLT:
            return {'code': 400, 'output': '', 'marker': False}
        stylesheet = etree.fromstring((value if vulnerable else SAFE_XSLT).encode('utf-8'),
                                      etree.XMLParser(resolve_entities=False, no_network=True))
        access = etree.XSLTAccessControl(read_file=False, write_file=False, create_dir=False,
                                        read_network=False, write_network=False)
        transform = etree.XSLT(stylesheet,
                               extensions={('urn:benchmark-extension', 'marker'): marker} if vulnerable else {},
                               access_control=access)
        output = str(transform(document))
    else:
        return {'code': 400, 'output': '', 'marker': False}
    return {'code': 0, 'output': output[:1024], 'marker': MARKER.exists()}


try:
    print(json.dumps(main()))
except (ValueError, etree.LxmlError) as error:
    print(json.dumps({'code': 422, 'output': '', 'marker': False, 'error': type(error).__name__}))
